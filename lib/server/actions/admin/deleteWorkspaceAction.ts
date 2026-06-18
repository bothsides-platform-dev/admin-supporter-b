'use server';

import { eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { workspaces, adminAuditLogs } from '@/lib/db/schema';
import { requireSuperAdmin } from '@/lib/auth/admin-session';
import { actionDb } from '@/lib/server/actions/auth/_shared';

export async function deleteWorkspaceAction(
  workspaceId: string,
  returnPath: '/buyers' | '/sellers',
): Promise<void> {
  const session = await requireSuperAdmin();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await actionDb().transaction(async (tx: any) => {
    // 삭제 전 스냅샷을 감사 로그에 기록
    const [wsRow] = await tx
      .select({ name: workspaces.name, type: workspaces.type, status: workspaces.status })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1);

    await tx.insert(adminAuditLogs).values({
      actor: session.adminId,
      action: 'workspace.hard_delete',
      entityType: 'workspace',
      entityId: workspaceId,
      payloadJson: {
        snapshot: { name: wsRow?.name, type: wsRow?.type, status: wsRow?.status },
      },
    });

    await tx.delete(workspaces).where(eq(workspaces.id, workspaceId));
  });

  redirect(returnPath);
}
