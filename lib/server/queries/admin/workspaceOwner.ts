import { and, eq } from 'drizzle-orm';
import { workspaceMembers, users } from '@/lib/db/schema';
import { actionDb } from '@/lib/server/actions/auth/_shared';
import { migrateSignupSource, type SignupSource } from '@/lib/types/signup-source';

type DB = ReturnType<typeof actionDb>;

export interface WorkspaceOwnerContact {
  name: string;
  email: string;
  phone: string | null;
  emailVerified: boolean;
  signupSource: SignupSource;
}

/**
 * The admin member of a workspace — for PG workspaces this is the registering
 * user, whose `users` record holds the verified phone. Used by admin pages to
 * show a contact for the workspace (replacing the removed pgProfiles.salesContact).
 */
export async function getWorkspaceAdminUser(
  workspaceId: string,
  db: DB = actionDb(),
): Promise<WorkspaceOwnerContact | null> {
  const [row] = await db
    .select({
      name: users.name,
      email: users.email,
      phone: users.phone,
      emailVerified: users.emailVerified,
      signupSource: users.signupSource,
    })
    .from(workspaceMembers)
    .innerJoin(users, eq(workspaceMembers.userId, users.id))
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.role, 'admin'),
      ),
    )
    .limit(1);

  if (!row) return null;
  return { ...row, signupSource: migrateSignupSource(row.signupSource) };
}
