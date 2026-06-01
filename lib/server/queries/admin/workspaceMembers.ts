import { eq } from 'drizzle-orm';
import { workspaceMembers, users } from '@/lib/db/schema';
import { actionDb } from '@/lib/server/actions/auth/_shared';

export type WorkspaceMemberRow = {
  userId: string;
  name: string;
  email: string;
  role: 'admin' | 'member';
  joinedAt: Date;
  isLastAdmin: boolean;
};

export async function getWorkspaceMembers(workspaceId: string): Promise<WorkspaceMemberRow[]> {
  const rows = await actionDb()
    .select({
      userId: users.id,
      name: users.name,
      email: users.email,
      role: workspaceMembers.role,
      joinedAt: workspaceMembers.joinedAt,
    })
    .from(workspaceMembers)
    .innerJoin(users, eq(workspaceMembers.userId, users.id))
    .where(eq(workspaceMembers.workspaceId, workspaceId))
    .orderBy(workspaceMembers.role, workspaceMembers.joinedAt);

  const adminCount = rows.filter((r) => r.role === 'admin').length;
  return rows.map((r) => ({
    ...r,
    role: r.role as 'admin' | 'member',
    isLastAdmin: r.role === 'admin' && adminCount === 1,
  }));
}
