'use server';

import { eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { workspaces, adminAuditLogs, rfps, rfpInvitations, bids } from '@/lib/db/schema';
import { requireSuperAdmin } from '@/lib/auth/admin-session';
import { actionDb } from '@/lib/server/actions/auth/_shared';

export async function deleteWorkspaceAction(
  workspaceId: string,
  returnPath: '/buyers' | '/sellers',
): Promise<void> {
  const session = await requireSuperAdmin();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await actionDb().transaction(async (tx: any) => {
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

    // workspaces.id를 NOT NULL FK로 참조하는 테이블을 먼저 처리한다.
    // ON DELETE CASCADE가 없어서 워크스페이스 삭제 전에 직접 정리해야 한다.

    // rfps.buyer_ws_id — NOT NULL, no cascade (구매사 워크스페이스인 경우)
    // 삭제하면 rfp_invitations·rfp_allowed_pg·bids·contracts 등이 rfp_id cascade로 연쇄 삭제됨
    await tx.delete(rfps).where(eq(rfps.buyerWsId, workspaceId));

    // rfp_invitations.pg_ws_id — NOT NULL, no cascade (PG 워크스페이스인 경우)
    await tx.delete(rfpInvitations).where(eq(rfpInvitations.pgWsId, workspaceId));

    // bids.pg_ws_id — NOT NULL, no cascade (PG 워크스페이스인 경우)
    // 삭제하면 contracts·bid_notes·attachments(bid_id) 등이 cascade로 연쇄 삭제됨
    await tx.delete(bids).where(eq(bids.pgWsId, workspaceId));

    // 워크스페이스 삭제 (workspace_members·workspace_invitations·columns 등 cascade FK는 DB가 처리)
    await tx.delete(workspaces).where(eq(workspaces.id, workspaceId));
  });

  redirect(returnPath);
}
