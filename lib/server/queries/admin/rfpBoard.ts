import { sql } from 'drizzle-orm';
import { pageNumber } from '@/lib/admin-list';
import { requireAdminPermission } from '@/lib/auth/admin-session';
import { actionDb } from '@/lib/server/actions/auth/_shared';
import {
  BOARD_PAGE_SIZE,
  BOARD_STAGES,
  type BoardParams,
  type BoardStage,
  type ReviewStatus,
  type SigningStatus,
} from '@/lib/rfp-board';

function searchTerm(value: unknown) {
  return typeof value === 'string' ? value.trim().slice(0, 120) : '';
}

export async function getRfpBoard(params: BoardParams = {}, db = actionDb()) {
  await requireAdminPermission('data.view');
  const term = searchTerm(params.q);
  const pg = searchTerm(params.pg);
  const stage = params.status && Object.hasOwn(BOARD_STAGES, params.status) ? params.status : '';
  const page = stage ? pageNumber(params.page) : 1;
  // Aggregate each one-to-many source before ranking requests. Older matching rounds
  // remain searchable but cannot advance the current PG's quote or signing stage.
  return db
    .select({
      id: sql<string>`board.id`,
      code: sql<string>`board.code`,
      title: sql<string>`board.title`,
      buyer: sql<string>`board.buyer`,
      matching: sql<boolean>`board.matching`,
      pgNames: sql<string | null>`board.pg_names`,
      stage: sql<BoardStage>`board.stage`,
      rfpStatus: sql<string>`board.status`,
      review: sql<ReviewStatus | null>`board.review`,
      signing: sql<SigningStatus | null>`board.signing`,
      hasLegacy: sql<boolean>`board.has_legacy`,
      overdue: sql<boolean>`board.overdue`,
      deadline: sql<string>`board.deadline::text`,
      signingDue: sql<string | null>`board.signing_due::text`,
      event: sql<string>`board.event`,
      eventAt: sql<string>`board.event_at::text`,
      total: sql<number>`board.total`.mapWith(Number),
      page: sql<number>`board.page`.mapWith(Number),
    })
    .from(
      sql`(
    with facts as (
      select r.id, r.code, r.title, r.status, buyer.name as buyer, (m.rfp_id is not null) as matching,
        rv.status as review, sc.status as signing, sc.expires_at as signing_due,
        exists(select 1 from signing_contracts old where old.rfp_id = r.id and old.kind = 'pg_buyer') as has_legacy,
        case when a.id is not null or r.status='awarded' then winner.name
          when m.rfp_id is not null then rv.name else inv.names end as pg_names,
        case when m.rfp_id is not null then coalesce(rq.deadline,r.deadline)
          else greatest(r.deadline,rq.deadline) end as deadline, ev.event, ev.event_at,
        case
          when r.status in ('closed', 'cancelled') and a.id is null then 'ended'
          when sc.status = 'completed' then 'completed'
          when sc.status is not null then 'signing'
          when a.id is not null or r.status = 'awarded' then 'awarded'
          when m.rfp_id is not null and rv.id is null then 'next_pg'
          when quotes.submitted then 'selection'
          else 'consulting' end as stage
      from rfps r join workspaces buyer on buyer.id = r.buyer_ws_id
      left join rfp_matching_requests m on m.rfp_id = r.id
      left join contracts a on a.rfp_id = r.id
      left join bids win_bid on win_bid.id = a.bid_id and win_bid.rfp_id = r.id
      left join workspaces winner on winner.id = win_bid.pg_ws_id
      left join lateral (
        select v.id, v.status, v.pg_ws_id, w.name from rfp_pg_reviews v join workspaces w on w.id = v.pg_ws_id
        where v.rfp_id = r.id and v.status in ('requested','reviewing','quoted')
        order by v.created_at desc, v.id limit 1
      ) rv on true
      left join lateral (
        select v.status, v.updated_at from rfp_pg_reviews v where v.rfp_id = r.id
        order by v.updated_at desc, v.id limit 1
      ) last_review on true
      left join lateral (
        select s.status, s.expires_at, greatest(s.created_at,s.sent_at,s.completed_at,s.canceled_at,s.last_polled_at) as observed_at
        from signing_contracts s where s.rfp_id = r.id and s.kind = 'platform_buyer'
        order by s.round desc, s.created_at desc, s.id limit 1
      ) sc on true
      left join lateral (
        select string_agg(w.name, ', ' order by w.name, w.id) filter (where i.status <> 'expired'
          and latest.status is distinct from 'withdrawn') as names,
          max(i.opened_at) as opened_at, max(i.sent_at) as sent_at
        from rfp_invitations i join workspaces w on w.id = i.pg_ws_id
        left join lateral (select b.status from bids b where b.rfp_id = i.rfp_id and b.pg_ws_id = i.pg_ws_id
          and b.status <> 'draft' order by b.round desc limit 1) latest on true
        where i.rfp_id = r.id and i.status <> 'draft'
      ) inv on true
      left join lateral (
        select bool_or(b.status = 'submitted' and not exists (
          select 1 from rfp_requote_requests q where q.rfp_id=r.id and q.pg_ws_id=b.pg_ws_id
          and q.status='pending' and q.round>b.round)) as submitted,
          max(b.submitted_at) filter (where b.status = 'submitted') as submitted_at,
          max(b.updated_at) filter (where b.status = 'withdrawn') as withdrawn_at
        from (select distinct on (pg_ws_id) pg_ws_id, round, status, submitted_at, updated_at from bids
          where rfp_id = r.id and status <> 'draft' and (m.rfp_id is null or pg_ws_id = rv.pg_ws_id)
          order by pg_ws_id, round desc) b
      ) quotes on true
      left join lateral (
        select max(q.deadline) as deadline, max(q.created_at) as requested_at from rfp_requote_requests q
        where q.rfp_id = r.id and q.status = 'pending' and (m.rfp_id is null or q.pg_ws_id = rv.pg_ws_id)
      ) rq on true
      cross join lateral (
        select event, event_at from (values ('서명 상태 확인',sc.observed_at), ('PG 선정',a.awarded_at),
          ('상담 상태 변경',last_review.updated_at), ('견적 철회',quotes.withdrawn_at), ('견적 제출',quotes.submitted_at),
          ('재견적 요청',rq.requested_at), ('초대 열람',inv.opened_at), ('초대 발송',inv.sent_at),
          ('종료된 RFP 변경',case when r.status in ('closed','cancelled') then r.updated_at end),
          ('신청 접수',coalesce(r.sent_at,r.created_at))) e(event,event_at)
        where event_at is not null order by event_at desc limit 1
      ) ev
      where r.status <> 'draft'
        ${
          term
            ? sql`and (strpos(lower(r.code),lower(${term})) > 0 or strpos(lower(r.title),lower(${term})) > 0
          or strpos(lower(buyer.name),lower(${term})) > 0)`
            : sql.empty()
        }
        ${params.type === 'matching' ? sql`and m.rfp_id is not null` : params.type === 'legacy' ? sql`and m.rfp_id is null` : sql.empty()}
        ${
          pg
            ? sql`and exists (select 1 from workspaces w where strpos(lower(w.name),lower(${pg})) > 0 and w.id in (
          select pg_ws_id from rfp_invitations where rfp_id=r.id and status <> 'draft'
          union select pg_ws_id from rfp_pg_reviews where rfp_id=r.id
          union select pg_ws_id from bids where rfp_id=r.id and status <> 'draft'))`
            : sql.empty()
        }
    ), ranked as (
      select facts.*, status='sent' and deadline <= now() as overdue, count(*) over(partition by stage) as total,
        row_number() over(partition by stage order by
          case when stage in ('consulting','selection') then deadline end asc nulls last,
          case when stage = 'signing' then signing_due end asc nulls last, event_at desc, id) as position
      from facts ${stage ? sql`where stage = ${stage}` : sql.empty()}
    ), paged as (
      select ranked.*, least(${page}, (total + ${BOARD_PAGE_SIZE - 1}::int) / ${BOARD_PAGE_SIZE}::int) as page from ranked
    )
    select * from paged where position between (page - 1) * ${BOARD_PAGE_SIZE} + 1 and page * ${BOARD_PAGE_SIZE}
  ) board`,
    )
    .orderBy(sql`board.stage, board.position`);
}

export async function getRfpHistory(id: string, db = actionDb()) {
  await requireAdminPermission('data.view');
  const [reviews, signings] = await Promise.all([
    db
      .select({
        id: sql<string>`v.id`,
        pgId: sql<string>`v.pg_ws_id`,
        pg: sql<string>`w.name`,
        status: sql<ReviewStatus>`v.status`,
        reason: sql<string>`v.reason`,
        createdAt: sql<string>`v.created_at::text`,
        updatedAt: sql<string>`v.updated_at::text`,
      })
      .from(sql`rfp_pg_reviews v join workspaces w on w.id = v.pg_ws_id`)
      .where(sql`v.rfp_id = ${id}`)
      .orderBy(sql`v.created_at desc, v.id`),
    db
      .select({
        id: sql<string>`s.id`,
        kind: sql<'platform_buyer' | 'pg_buyer'>`s.kind`,
        round: sql<number>`s.round`,
        status: sql<SigningStatus>`s.status`,
        reason: sql<string | null>`s.cancel_reason`,
        observedAt: sql<string>`greatest(s.created_at,s.sent_at,s.completed_at,s.canceled_at,s.last_polled_at)::text`,
      })
      .from(sql`signing_contracts s`)
      .where(sql`s.rfp_id = ${id}`)
      .orderBy(sql`s.round desc, s.created_at desc, s.id`),
  ]);
  return { reviews, signings };
}

export type BoardCard = Awaited<ReturnType<typeof getRfpBoard>>[number];
