'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { workspaces, adminAuditLogs } from '@/lib/db/schema';
import { requireAdminPermission } from '@/lib/auth/admin-session';
import { actionDb } from '@/lib/server/actions/auth/_shared';

type DB = ReturnType<typeof actionDb>;

export async function unsuspendWorkspaceAction(
  db: DB = actionDb(),
  workspaceId: string,
): Promise<void> {
  const session = await requireAdminPermission('workspace.manage');

  await (db as ReturnType<typeof actionDb>).transaction(async (tx) => {
    await tx
      .update(workspaces)
      .set({ status: 'active', statusReason: null, reviewedAt: new Date() })
      .where(eq(workspaces.id, workspaceId));

    await tx.insert(adminAuditLogs).values({
      actor: session.adminId,
      action: 'workspace.unsuspend',
      entityType: 'workspace',
      entityId: workspaceId,
      payloadJson: { after: { status: 'active' } },
    });
  });

  revalidatePath(`/buyers/${workspaceId}`);
  revalidatePath(`/sellers/${workspaceId}`);
  revalidatePath('/buyers');
  revalidatePath('/sellers');
  revalidatePath('/review');
  revalidatePath('/');
}
