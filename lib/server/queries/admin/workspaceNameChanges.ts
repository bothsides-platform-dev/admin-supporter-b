import { and, asc, desc, eq, gte, ilike, lt, or, sql } from 'drizzle-orm';
import { ADMIN_PAGE_SIZE, dateBounds, pageNumber, type ListParams } from '@/lib/admin-list';
import { users, workspaceNameChangeRequests, workspaces } from '@/lib/db/schema';
import { actionDb } from '@/lib/server/actions/auth/_shared';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = any;

export const WORKSPACE_NAME_CHANGE_PAGE_SIZE = 100;

export type WorkspaceNameChangeRequestRow = {
  id: string;
  workspaceId: string;
  workspaceType: 'buyer' | 'pg' | null;
  requesterName: string | null;
  requesterEmail: string | null;
  currentName: string;
  requestedName: string;
  status: string;
  reason: string | null;
  reviewedBy: string | null;
  submittedAt: Date;
  reviewedAt: Date | null;
};

export async function listWorkspaceNameChangeRequests(
  opts: { status?: string } = {},
  db: DB = actionDb(),
): Promise<WorkspaceNameChangeRequestRow[]> {
  const rows = await db.select({
    id: workspaceNameChangeRequests.id,
    workspaceId: workspaceNameChangeRequests.workspaceId,
    workspaceType: workspaces.type,
    requesterName: users.name,
    requesterEmail: users.email,
    currentName: workspaceNameChangeRequests.currentName,
    requestedName: workspaceNameChangeRequests.requestedName,
    status: workspaceNameChangeRequests.status,
    reason: workspaceNameChangeRequests.reason,
    reviewedBy: workspaceNameChangeRequests.reviewedBy,
    submittedAt: workspaceNameChangeRequests.submittedAt,
    reviewedAt: workspaceNameChangeRequests.reviewedAt,
  }).from(workspaceNameChangeRequests)
    .leftJoin(workspaces, eq(workspaceNameChangeRequests.workspaceId, workspaces.id))
    .leftJoin(users, eq(workspaceNameChangeRequests.requestedByUserId, users.id))
    .where(opts.status ? eq(workspaceNameChangeRequests.status, opts.status) : undefined)
    .orderBy(desc(workspaceNameChangeRequests.submittedAt), desc(workspaceNameChangeRequests.id))
    .limit(WORKSPACE_NAME_CHANGE_PAGE_SIZE);
  return rows as WorkspaceNameChangeRequestRow[];
}

export async function listWorkspaceNameChangeRequestsPage(opts: ListParams = {}, db: DB = actionDb()): Promise<{ rows: WorkspaceNameChangeRequestRow[]; total: number; page: number }> {
  const { fromDate, toDate } = dateBounds(opts.from, opts.to);
  const where = and(
    ['pending', 'approved', 'rejected'].includes(opts.status ?? '') ? eq(workspaceNameChangeRequests.status, opts.status!) : undefined,
    opts.q ? or(ilike(workspaceNameChangeRequests.currentName, `%${opts.q}%`), ilike(workspaceNameChangeRequests.requestedName, `%${opts.q}%`)) : undefined,
    fromDate ? gte(workspaceNameChangeRequests.submittedAt, fromDate) : undefined,
    toDate ? lt(workspaceNameChangeRequests.submittedAt, toDate) : undefined,
  );
  const [{ total }] = await db.select({ total: sql<number>`cast(count(*) as int)` }).from(workspaceNameChangeRequests).where(where) as { total: number }[];
  const page = Math.min(pageNumber(opts.page), Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE)));
  const order = opts.sort === 'oldest' ? [asc(workspaceNameChangeRequests.submittedAt), asc(workspaceNameChangeRequests.id)] : [desc(workspaceNameChangeRequests.submittedAt), desc(workspaceNameChangeRequests.id)];
  const rows = await db.select({ id: workspaceNameChangeRequests.id, workspaceId: workspaceNameChangeRequests.workspaceId, workspaceType: workspaces.type, requesterName: users.name, requesterEmail: users.email, currentName: workspaceNameChangeRequests.currentName, requestedName: workspaceNameChangeRequests.requestedName, status: workspaceNameChangeRequests.status, reason: workspaceNameChangeRequests.reason, reviewedBy: workspaceNameChangeRequests.reviewedBy, submittedAt: workspaceNameChangeRequests.submittedAt, reviewedAt: workspaceNameChangeRequests.reviewedAt })
    .from(workspaceNameChangeRequests).leftJoin(workspaces, eq(workspaceNameChangeRequests.workspaceId, workspaces.id)).leftJoin(users, eq(workspaceNameChangeRequests.requestedByUserId, users.id))
    .where(where).orderBy(...order).limit(ADMIN_PAGE_SIZE).offset((page - 1) * ADMIN_PAGE_SIZE) as WorkspaceNameChangeRequestRow[];
  return { rows, total, page };
}
