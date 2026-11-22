import { and, asc, count, desc, eq, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm';
import { ADMIN_PAGE_SIZE, pageNumber } from '@/lib/admin-list';
import { requireAdminPermission } from '@/lib/auth/admin-session';
import { adminFollowups as t, adminFollowupUpdates, adminUsers, rfps, workspaces } from '@/lib/db/schema';
import type { DB } from '@/lib/db';
import type { TaskParams, TaskView } from '@/lib/followups';
import { isUuid } from '@/lib/utils';
import { actionDb } from '@/lib/server/actions/auth/_shared';

type ReadDb = DB | Parameters<Parameters<DB['transaction']>[0]>[0];
const startToday = sql`(date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul')`;
const today = sql`${t.dueAt} >= ${startToday} and ${t.dueAt} < ${startToday} + interval '24 hours'`;
const overdue = sql`${t.dueAt} < now()`;

export async function taskCounts(db = actionDb()) {
  await requireAdminPermission('data.view');
  const [counts] = await db
    .select({
      unassigned: sql<number>`count(*) filter(where ${t.ownerId} is null)`.mapWith(Number),
      today: sql<number>`count(*) filter(where ${today})`.mapWith(Number),
      overdue: sql<number>`count(*) filter(where ${overdue})`.mapWith(Number),
    })
    .from(t)
    .where(isNull(t.completedAt));
  return counts;
}

export async function nextRfpFollowups(ids: string[], db = actionDb()) {
  await requireAdminPermission('data.view');
  if (!ids.length) return [];
  return db
    .selectDistinctOn([t.rfpId], { rfpId: t.rfpId, owner: adminUsers.email, due: t.dueAt, title: t.title })
    .from(t)
    .leftJoin(adminUsers, eq(t.ownerId, adminUsers.id))
    .where(and(inArray(t.rfpId, ids), isNull(t.completedAt)))
    .orderBy(t.rfpId, t.dueAt, t.id);
}

export async function followupTimeline(id: string, pageParam: string | undefined, db = actionDb()) {
  await requireAdminPermission('data.view');
  if (!isUuid(id)) return null;
  const [task] = await db
    .select({
      title: t.title,
      due: t.dueAt,
      done: t.completedAt,
      owner: adminUsers.email,
      company: workspaces.name,
      rfpId: t.rfpId,
      workspaceId: t.workspaceId,
    })
    .from(t)
    .leftJoin(adminUsers, eq(t.ownerId, adminUsers.id))
    .leftJoin(workspaces, eq(t.workspaceId, workspaces.id))
    .where(eq(t.id, id));
  if (!task) return null;
  const condition = eq(adminFollowupUpdates.taskId, id);
  const [{ total }] = await db.select({ total: count() }).from(adminFollowupUpdates).where(condition);
  const page = Math.min(pageNumber(pageParam), Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE)));
  const rows = await db
    .select()
    .from(adminFollowupUpdates)
    .where(condition)
    .orderBy(desc(adminFollowupUpdates.createdAt), desc(adminFollowupUpdates.id))
    .limit(ADMIN_PAGE_SIZE)
    .offset((page - 1) * ADMIN_PAGE_SIZE);
  return { task, rows, page, total };
}

// Source IDs are stable across re-quotes and PG changes.
export function roundOptions(db: ReadDb, rfpId: string) {
  return db
    .select({ key: sql<string>`x.key`, label: sql<string>`x.label`, pgId: sql<string | null>`x.pg_id` })
    .from(
      sql`(
    select 'invitation:' || i.id as key, w.name || ' · 초대' as label, i.sent_at as at, w.id as pg_id
    from rfp_invitations i join workspaces w on w.id=i.pg_ws_id where i.rfp_id=${rfpId} and i.status <> 'draft'
    union all select 'review:' || v.id, w.name || ' · 맞춤 상담', v.created_at, w.id
    from rfp_pg_reviews v join workspaces w on w.id=v.pg_ws_id where v.rfp_id=${rfpId}
    union all select 'bid:' || b.id, w.name || ' · ' || b.round || '차 견적', b.submitted_at, w.id
    from bids b join workspaces w on w.id=b.pg_ws_id where b.rfp_id=${rfpId} and b.status <> 'draft'
    union all select 'signing:' || s.id, (case when s.kind='platform_buyer' then '노온 합의서' else '과거 PG 계약' end) || ' · ' || s.round || '차', s.created_at, null::uuid
    from signing_contracts s where s.rfp_id=${rfpId}
    union all select 'delivery:' || o.id, coalesce(w.name,'PG') || ' · 마감 안내 ' || left(o.id::text,8), o.scheduled_at, w.id
    from outbox_entries o left join workspaces w on w.id::text=split_part(o.dedupe_key,':',3)
    where o.event='rfp.deadline_reminder' and split_part(o.dedupe_key,':',2)=${rfpId}
  ) x`,
    )
    .orderBy(sql`x.at desc, x.key`);
}

export async function getTaskContext(params: TaskParams, db = actionDb()) {
  await requireAdminPermission('data.view');
  if (params.rfp) {
    if (!isUuid(params.rfp)) return null;
    const [rfp] = await db
      .select({ id: rfps.id, label: rfps.code, name: workspaces.name, workspaceId: workspaces.id })
      .from(rfps)
      .innerJoin(workspaces, eq(workspaces.id, rfps.buyerWsId))
      .where(eq(rfps.id, params.rfp));
    if (!rfp || (params.workspace && params.workspace !== rfp.workspaceId)) return null;
    return {
      rfpId: rfp.id,
      workspaceId: rfp.workspaceId,
      label: `${rfp.name} · ${rfp.label}`,
      rounds: await roundOptions(db, rfp.id),
    };
  }
  if (params.workspace) {
    if (!isUuid(params.workspace)) return null;
    const [w] = await db
      .select({ id: workspaces.id, name: workspaces.name })
      .from(workspaces)
      .where(eq(workspaces.id, params.workspace));
    return w ? { rfpId: '', workspaceId: w.id, label: w.name, rounds: [] } : null;
  }
  return { rfpId: '', workspaceId: '', label: '미연결 문의', rounds: [] };
}

export async function getTaskOwners(db = actionDb()) {
  await requireAdminPermission('tasks.write');
  return db
    .select({ id: adminUsers.id, email: adminUsers.email })
    .from(adminUsers)
    .orderBy(asc(adminUsers.email));
}

export async function listFollowups(params: TaskParams = {}, db = actionDb()) {
  await requireAdminPermission('data.view');
  const filters: Record<TaskView, ReturnType<typeof isNull> | undefined> = {
    open: undefined,
    unassigned: isNull(t.ownerId),
    today,
    overdue,
    done: undefined,
  };
  const view = params.view && Object.hasOwn(filters, params.view) ? (params.view as TaskView) : 'open';
  const company = params.workspace && isUuid(params.workspace) ? params.workspace : null;
  const companyScope = company
    ? or(
        eq(t.workspaceId, company),
        sql`exists (
    select 1 from rfp_invitations i where i.id=${t.invitationId} and i.pg_ws_id=${company}
    union all select 1 from rfp_pg_reviews v where v.id=${t.reviewId} and v.pg_ws_id=${company}
    union all select 1 from bids b where b.id=${t.bidId} and b.pg_ws_id=${company}
    union all select 1 from outbox_entries o where o.id=${t.deliveryId} and split_part(o.dedupe_key,':',3)=${company})`,
      )
    : undefined;
  const where = and(
    view === 'done' ? isNotNull(t.completedAt) : isNull(t.completedAt),
    filters[view],
    companyScope,
    params.rfp && isUuid(params.rfp) ? eq(t.rfpId, params.rfp) : undefined,
    (params.rfp && !isUuid(params.rfp)) || (params.workspace && !company) ? sql`false` : undefined,
  );
  const [{ total }] = await db.select({ total: count() }).from(t).where(where);
  const page = Math.min(pageNumber(params.page), Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE)));
  const latestNote = db
    .select({
      note: adminFollowupUpdates.note,
      at: adminFollowupUpdates.createdAt,
      actor: adminFollowupUpdates.actor,
    })
    .from(adminFollowupUpdates)
    .where(eq(adminFollowupUpdates.taskId, t.id))
    .orderBy(desc(adminFollowupUpdates.createdAt), desc(adminFollowupUpdates.id))
    .limit(1)
    .as('latest');
  const rows = await db
    .select({
      task: t,
      owner: adminUsers.email,
      company: workspaces.name,
      code: rfps.code,
      note: latestNote.note,
      noteAt: latestNote.at,
      noteActor: latestNote.actor,
      roundLabel: sql<string | null>`coalesce(
      (select '마감 안내 ' || left(o.id::text,8) from outbox_entries o where o.id=${t.deliveryId}),
      (select (case when s.kind='platform_buyer' then '노온 합의서' else '과거 PG 계약' end) || ' · ' || s.round || '차' from signing_contracts s where s.id=${t.signingId}),
      (select w.name || ' · ' || b.round || '차 견적' from bids b join workspaces w on w.id=b.pg_ws_id where b.id=${t.bidId}),
      (select w.name || ' · 맞춤 상담' from rfp_pg_reviews v join workspaces w on w.id=v.pg_ws_id where v.id=${t.reviewId}),
      (select w.name || ' · 초대' from rfp_invitations i join workspaces w on w.id=i.pg_ws_id where i.id=${t.invitationId}))`,
    })
    .from(t)
    .leftJoin(adminUsers, eq(adminUsers.id, t.ownerId))
    .leftJoin(workspaces, eq(workspaces.id, t.workspaceId))
    .leftJoin(rfps, eq(rfps.id, t.rfpId))
    .leftJoinLateral(latestNote, sql`true`)
    .where(where)
    .orderBy(view === 'done' ? desc(t.completedAt) : asc(t.dueAt), asc(t.id))
    .limit(ADMIN_PAGE_SIZE)
    .offset((page - 1) * ADMIN_PAGE_SIZE);
  return { rows, page, total, view };
}
