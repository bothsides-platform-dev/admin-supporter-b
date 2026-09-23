import { and, asc, desc, eq, gte, ilike, inArray, isNotNull, isNull, lt, or, sql } from 'drizzle-orm';
import { ADMIN_PAGE_SIZE, dateBounds, pageNumber, type ListParams } from '@/lib/admin-list';
import { users, workspaceMembers, workspaces } from '@/lib/db/schema';
import { actionDb } from '@/lib/server/actions/auth/_shared';

export type UserRow = {
  id: string;
  name: string;
  email: string;
  status: string;
  deletedAt: Date | null;
  workspaceCount: number;
  createdAt: Date;
};

export type UserMembershipRow = {
  workspaceId: string;
  workspaceName: string;
  workspaceType: 'buyer' | 'pg';
  role: 'admin' | 'member';
  joinedAt: Date;
  isLastAdmin: boolean;
};

export type UserDetailResult = {
  user: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    status: string;
    deletedAt: Date | null;
    createdAt: Date;
  };
  memberships: UserMembershipRow[];
};

export async function listUsers(
  opts: { q?: string; status?: string } = {},
): Promise<UserRow[]> {
  const { q, status } = opts;
  // status='deleted' 는 탈퇴 유저만, 그 외에는 deletedAt IS NULL 로 탈퇴 유저 제외
  const deletedFilter = status === 'deleted' ? isNotNull(users.deletedAt) : isNull(users.deletedAt);
  const rows = await actionDb()
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      status: users.status,
      deletedAt: users.deletedAt,
      workspaceCount: sql<number>`cast(count(${workspaceMembers.userId}) as int)`,
      createdAt: users.createdAt,
    })
    .from(users)
    .leftJoin(workspaceMembers, eq(workspaceMembers.userId, users.id))
    .where(
      and(
        deletedFilter,
        q ? or(ilike(users.name, `%${q}%`), ilike(users.email, `%${q}%`)) : undefined,
        status && status !== 'all' && status !== 'deleted' ? eq(users.status, status) : undefined,
      ),
    )
    .groupBy(users.id, users.name, users.email, users.status, users.deletedAt, users.createdAt)
    .orderBy(desc(users.createdAt));
  return rows as UserRow[];
}

export async function listUsersPage(opts: ListParams = {}) {
  const { fromDate, toDate } = dateBounds(opts.from, opts.to);
  const where = and(
    opts.status === 'deleted' ? isNotNull(users.deletedAt) : isNull(users.deletedAt),
    opts.q ? or(ilike(users.name, `%${opts.q}%`), ilike(users.email, `%${opts.q}%`)) : undefined,
    opts.status === 'active' || opts.status === 'suspended' ? eq(users.status, opts.status) : undefined,
    fromDate ? gte(users.createdAt, fromDate) : undefined,
    toDate ? lt(users.createdAt, toDate) : undefined,
  );
  const db = actionDb();
  const [{ total }] = await db.select({ total: sql<number>`cast(count(*) as int)` }).from(users).where(where);
  const page = Math.min(pageNumber(opts.page), Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE)));
  const order = opts.sort === 'oldest' ? [asc(users.createdAt), asc(users.id)] : opts.sort === 'name' ? [asc(users.name), asc(users.id)] : [desc(users.createdAt), desc(users.id)];
  const rows = await db.select({ id: users.id, name: users.name, email: users.email, status: users.status, deletedAt: users.deletedAt, workspaceCount: sql<number>`cast(count(${workspaceMembers.userId}) as int)`, createdAt: users.createdAt })
    .from(users).leftJoin(workspaceMembers, eq(workspaceMembers.userId, users.id)).where(where)
    .groupBy(users.id, users.name, users.email, users.status, users.deletedAt, users.createdAt)
    .orderBy(...order).limit(ADMIN_PAGE_SIZE).offset((page - 1) * ADMIN_PAGE_SIZE);
  return { rows: rows as UserRow[], total, page };
}

export async function getUserDetail(userId: string): Promise<UserDetailResult | null> {
  const db = actionDb();

  const [user] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      phone: users.phone,
      status: users.status,
      deletedAt: users.deletedAt,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, userId));

  if (!user) return null;

  const memberships = await db
    .select({
      workspaceId: workspaces.id,
      workspaceName: workspaces.name,
      workspaceType: workspaces.type,
      role: workspaceMembers.role,
      joinedAt: workspaceMembers.joinedAt,
    })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaceMembers.workspaceId, workspaces.id))
    .where(eq(workspaceMembers.userId, userId))
    .orderBy(workspaceMembers.role, workspaceMembers.joinedAt);

  const adminMemberships = memberships.filter((m) => m.role === 'admin');
  const lastAdminWorkspaceIds = new Set<string>();

  if (adminMemberships.length > 0) {
    const adminCountRows = await db
      .select({
        workspaceId: workspaceMembers.workspaceId,
        adminCount: sql<number>`cast(count(*) as int)`,
      })
      .from(workspaceMembers)
      .where(
        and(
          inArray(
            workspaceMembers.workspaceId,
            adminMemberships.map((m) => m.workspaceId),
          ),
          eq(workspaceMembers.role, 'admin'),
        ),
      )
      .groupBy(workspaceMembers.workspaceId);

    for (const row of adminCountRows) {
      if (row.adminCount === 1) lastAdminWorkspaceIds.add(row.workspaceId);
    }
  }

  return {
    user,
    memberships: memberships.map((m) => ({
      ...m,
      workspaceType: m.workspaceType as 'buyer' | 'pg',
      role: m.role as 'admin' | 'member',
      isLastAdmin: lastAdminWorkspaceIds.has(m.workspaceId),
    })),
  };
}
