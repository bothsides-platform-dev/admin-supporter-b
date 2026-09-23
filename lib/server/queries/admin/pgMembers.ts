import { and, asc, desc, eq, gte, ilike, lt, or, sql } from 'drizzle-orm';
import { ADMIN_PAGE_SIZE, dateBounds, pageNumber, type ListParams } from '@/lib/admin-list';
import { workspaceMembers, users, workspaces } from '@/lib/db/schema';
import { actionDb } from '@/lib/server/actions/auth/_shared';

export type PgMemberRow = {
  userId: string;
  workspaceId: string;
  name: string;
  email: string;
  workspaceName: string;
  joinedAt: Date;
  approvalStatus: string;
};

/**
 * PG 워크스페이스 멤버 목록.
 *
 * status 인자:
 *   - 생략 또는 빈 문자열: pending_approval 만 반환 (기본 보기).
 *   - 'all': 전체.
 *   - 그 외 ('approved' | 'rejected'): 해당 값으로 필터.
 */
export async function listPgMembers({
  status,
}: {
  status?: string;
} = {}): Promise<PgMemberRow[]> {
  const db = actionDb();

  const VALID = new Set(['pending_approval', 'approved', 'rejected', 'all']);
  const safeStatus = status && VALID.has(status) ? status : undefined;
  const filterStatus = safeStatus === 'all' ? undefined : (safeStatus ?? 'pending_approval');

  const rows = await db
    .select({
      userId: workspaceMembers.userId,
      workspaceId: workspaceMembers.workspaceId,
      name: users.name,
      email: users.email,
      workspaceName: workspaces.name,
      joinedAt: workspaceMembers.joinedAt,
      approvalStatus: workspaceMembers.approvalStatus,
    })
    .from(workspaceMembers)
    .innerJoin(users, eq(workspaceMembers.userId, users.id))
    .innerJoin(workspaces, eq(workspaceMembers.workspaceId, workspaces.id))
    .where(
      and(
        eq(workspaces.type, 'pg'),
        filterStatus ? eq(workspaceMembers.approvalStatus, filterStatus) : undefined,
      ),
    )
    .orderBy(desc(workspaceMembers.joinedAt));

  return rows;
}

export async function listPgMembersPage(opts: ListParams = {}) {
  const { fromDate, toDate } = dateBounds(opts.from, opts.to);
  const status = ['approved', 'rejected', 'all'].includes(opts.status ?? '') ? opts.status : 'pending_approval';
  const where = and(eq(workspaces.type, 'pg'), status !== 'all' ? eq(workspaceMembers.approvalStatus, status!) : undefined,
    opts.q ? or(ilike(users.name, `%${opts.q}%`), ilike(users.email, `%${opts.q}%`), ilike(workspaces.name, `%${opts.q}%`)) : undefined,
    fromDate ? gte(workspaceMembers.joinedAt, fromDate) : undefined, toDate ? lt(workspaceMembers.joinedAt, toDate) : undefined);
  const db = actionDb();
  const [{ total }] = await db.select({ total: sql<number>`cast(count(*) as int)` }).from(workspaceMembers)
    .innerJoin(users, eq(workspaceMembers.userId, users.id)).innerJoin(workspaces, eq(workspaceMembers.workspaceId, workspaces.id)).where(where);
  const page = Math.min(pageNumber(opts.page), Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE)));
  const order = opts.sort === 'oldest' ? [asc(workspaceMembers.joinedAt), asc(workspaceMembers.userId)] : opts.sort === 'name' ? [asc(users.name), asc(workspaceMembers.userId)] : [desc(workspaceMembers.joinedAt), desc(workspaceMembers.userId)];
  const rows = await db.select({ userId: workspaceMembers.userId, workspaceId: workspaceMembers.workspaceId, name: users.name, email: users.email, workspaceName: workspaces.name, joinedAt: workspaceMembers.joinedAt, approvalStatus: workspaceMembers.approvalStatus })
    .from(workspaceMembers).innerJoin(users, eq(workspaceMembers.userId, users.id)).innerJoin(workspaces, eq(workspaceMembers.workspaceId, workspaces.id))
    .where(where).orderBy(...order).limit(ADMIN_PAGE_SIZE).offset((page - 1) * ADMIN_PAGE_SIZE);
  return { rows: rows as PgMemberRow[], total, page };
}
