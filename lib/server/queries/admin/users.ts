import { and, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import { users, workspaceMembers, workspaces } from '@/lib/db/schema';
import { actionDb } from '@/lib/server/actions/auth/_shared';

export type UserRow = {
  id: string;
  name: string;
  email: string;
  status: string;
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
    createdAt: Date;
  };
  memberships: UserMembershipRow[];
};

export async function listUsers(
  opts: { q?: string; status?: string } = {},
): Promise<UserRow[]> {
  const { q, status } = opts;
  const rows = await actionDb()
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      status: users.status,
      workspaceCount: sql<number>`cast(count(${workspaceMembers.userId}) as int)`,
      createdAt: users.createdAt,
    })
    .from(users)
    .leftJoin(workspaceMembers, eq(workspaceMembers.userId, users.id))
    .where(
      and(
        q ? or(ilike(users.name, `%${q}%`), ilike(users.email, `%${q}%`)) : undefined,
        status && status !== 'all' ? eq(users.status, status) : undefined,
      ),
    )
    .groupBy(users.id, users.name, users.email, users.status, users.createdAt)
    .orderBy(desc(users.createdAt));
  return rows as UserRow[];
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
