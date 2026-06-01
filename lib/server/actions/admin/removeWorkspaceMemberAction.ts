'use server';

import { and, eq, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { workspaceMembers, adminAuditLogs } from '@/lib/db/schema';
import { requireAdminSession } from '@/lib/auth/admin-session';
import { actionDb } from '@/lib/server/actions/auth/_shared';

type Result = { ok: true } | { ok: false; error: string };

export async function removeWorkspaceMemberAction(
  workspaceId: string,
  userId: string,
): Promise<Result> {
  const session = await requireAdminSession();
  const db = actionDb();

  const [memberRow] = await db
    .select({ role: workspaceMembers.role })
    .from(workspaceMembers)
    .where(
      and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)),
    );

  if (!memberRow) return { ok: false, error: 'MEMBER_NOT_FOUND' };

  if (memberRow.role === 'admin') {
    const [result] = await db
      .select({ adminCount: sql<number>`cast(count(*) as int)` })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, workspaceId),
          eq(workspaceMembers.role, 'admin'),
        ),
      );
    if ((result?.adminCount ?? 0) <= 1) return { ok: false, error: 'LAST_ADMIN' };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await db.transaction(async (tx: any) => {
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
      payloadJson: { userId },
    });
  });

  revalidatePath(`/buyers/${workspaceId}`);
  revalidatePath(`/sellers/${workspaceId}`);
  revalidatePath(`/users/${userId}`);
  return { ok: true };
}
