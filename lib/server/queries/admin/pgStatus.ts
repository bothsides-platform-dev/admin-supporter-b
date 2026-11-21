import { and, asc, count, desc, eq, gt, gte, ilike, isNotNull, isNull, lt, max, ne, sql, type SQL } from 'drizzle-orm';
import { ADMIN_PAGE_SIZE, dateBounds, pageNumber, type ListParams } from '@/lib/admin-list';
import { requireAdminPermission } from '@/lib/auth/admin-session';
import { bids, rfpInvitations, rfps, workspaces } from '@/lib/db/schema';
import { actionDb } from '@/lib/server/actions/auth/_shared';

export async function listPgStatusPage(params: ListParams = {}, db = actionDb()) {
  await requireAdminPermission('data.view');

  const companyFilter = and(
    eq(workspaces.type, 'pg'),
    params.q ? ilike(workspaces.name, `%${params.q}%`) : undefined,
  );
  const [{ total }] = await db.select({ total: count() }).from(workspaces).where(companyFilter);
  const page = Math.min(pageNumber(params.page), Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE)));
  const companies = db.$with('pg_companies').as(
    db.select({ id: workspaces.id, name: workspaces.name }).from(workspaces).where(companyFilter),
  );

  // 같은 PG사가 같은 RFP에 낸 여러 견적 중 초안을 건너뛰고 마지막 제출 회차만 고른다.
  const latestBid = db.select({ status: bids.status }).from(bids)
    .where(and(eq(bids.rfpId, rfpInvitations.rfpId), eq(bids.pgWsId, rfpInvitations.pgWsId), ne(bids.status, 'draft')))
    .orderBy(desc(bids.round)).limit(1).as('latest_bid');
  const { fromDate, toDate } = dateBounds(params.from, params.to);
  const responses = db.$with('sent_responses').as(
    db.select({
      pgWsId: rfpInvitations.pgWsId,
      rfpId: rfpInvitations.rfpId,
      sentAt: rfpInvitations.sentAt,
      openedAt: rfpInvitations.openedAt,
      bidStatus: latestBid.status,
    }).from(rfpInvitations)
      .innerJoin(companies, eq(companies.id, rfpInvitations.pgWsId))
      .leftJoinLateral(latestBid, sql`true`)
      .where(and(
        ne(rfpInvitations.status, 'draft'),
        fromDate && gte(rfpInvitations.sentAt, fromDate),
        toDate && lt(rfpInvitations.sentAt, toDate),
      )),
  );
  const nextRfp = db.selectDistinctOn([responses.pgWsId], {
    pgWsId: responses.pgWsId, id: rfps.id, title: rfps.title, deadline: rfps.deadline,
  }).from(responses)
    .innerJoin(rfps, eq(rfps.id, responses.rfpId))
    .where(and(isNull(responses.bidStatus), eq(rfps.status, 'sent'), gt(rfps.deadline, sql`now()`)))
    .orderBy(responses.pgWsId, asc(rfps.deadline), asc(rfps.id))
    .as('next_rfp');

  const lastSentAt = max(responses.sentAt);
  const countResponses = (condition: SQL | undefined) =>
    sql<number>`count(${responses.rfpId}) filter (where ${condition})`.mapWith(Number);
  const order = {
    newest: sql`${lastSentAt} desc nulls last`,
    oldest: sql`${lastSentAt} asc nulls last`,
    name: asc(companies.name),
    deadline: asc(nextRfp.deadline),
  };
  const sort = params.sort === 'newest' || params.sort === 'oldest' || params.sort === 'name' ? params.sort : 'deadline';
  const rows = await db.with(companies, responses)
    .select({
      id: companies.id, name: companies.name,
      invited: count(responses.rfpId),
      unopened: countResponses(and(isNull(responses.bidStatus), isNull(responses.openedAt))),
      openedWithoutBid: countResponses(and(isNull(responses.bidStatus), isNotNull(responses.openedAt))),
      submitted: countResponses(eq(responses.bidStatus, 'submitted')),
      withdrawn: countResponses(eq(responses.bidStatus, 'withdrawn')),
      lastSentAt,
      nextRfp: { id: nextRfp.id, title: nextRfp.title, deadline: nextRfp.deadline },
    })
    .from(companies)
    .leftJoin(responses, eq(companies.id, responses.pgWsId))
    .leftJoin(nextRfp, eq(companies.id, nextRfp.pgWsId))
    .groupBy(companies.id, companies.name, nextRfp.id, nextRfp.title, nextRfp.deadline)
    .orderBy(order[sort], asc(companies.name), asc(companies.id))
    .limit(ADMIN_PAGE_SIZE).offset((page - 1) * ADMIN_PAGE_SIZE);

  return { rows, total, page, sort };
}

export type PgStatusRow = Awaited<ReturnType<typeof listPgStatusPage>>['rows'][number];
