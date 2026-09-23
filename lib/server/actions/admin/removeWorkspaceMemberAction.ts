'use server';

import { and, eq, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { workspaceMembers, adminAuditLogs, workspaces } from '@/lib/db/schema';
import { requireAdminPermission } from '@/lib/auth/admin-session';
import { actionDb } from '@/lib/server/actions/auth/_shared';

type Result = { ok: true } | { ok: false; error: string };

export async function removeWorkspaceMemberAction(
  workspaceId: string,
  userId: string,
): Promise<Result> {
  const session = await requireAdminPermission('workspace.manage');
  const db = actionDb();

  let error: string | null = null;

  await db.transaction(async (tx) => {
    // Serialize membership removal so two operators cannot remove the last two admins.
    await tx.select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.id, workspaceId)).for('update');
    const [memberRow] = await tx
      .select({ role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(
        and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)),
      );

    if (!memberRow) { error = 'MEMBER_NOT_FOUND'; return; }

    if (memberRow.role === 'admin') {
      const [result] = await tx
        .select({ adminCount: sql<number>`cast(count(*) as int)` })
        .from(workspaceMembers)
        .where(
          and(
            eq(workspaceMembers.workspaceId, workspaceId),
            eq(workspaceMembers.role, 'admin'),
          ),
        );
      if ((result?.adminCount ?? 0) <= 1) { error = 'LAST_ADMIN'; return; }
    }

    await tx
      .delete(workspaceMembers)
      .where(
        and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)),
      );
    await tx.insert(adminAuditLogs).values({
      actor: session.adminId,
      action: 'workspace.member.remove',
      entityType: 'workspace',
      entityId: workspaceId,
      payloadJson: { before: { userId, role: memberRow.role }, after: {}, userId },
    });
  });

  if (error) return { ok: false, error };

  revalidatePath(`/buyers/${workspaceId}`);
  revalidatePath(`/sellers/${workspaceId}`);
  revalidatePath(`/users/${userId}`);
  return { ok: true };
}
