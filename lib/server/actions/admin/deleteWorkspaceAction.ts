'use server';

import { eq, inArray, or } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { workspaces, adminAuditLogs, rfps, rfpInvitations, bids, contracts, pgAgreementRates } from '@/lib/db/schema';
import { requireAdminPermission } from '@/lib/auth/admin-session';
import { actionDb } from '@/lib/server/actions/auth/_shared';
import type { ActionState } from '@/lib/action-state';
import { safeListReturnTo } from '@/lib/admin-return-to';

export async function deleteWorkspaceAction(
  workspaceId: string,
  returnPath: '/buyers' | '/sellers',
  confirmationName: string,
  returnTo?: string,
): Promise<ActionState> {
  const session = await requireAdminPermission('workspace.delete');

  const result = await actionDb().transaction(async (tx): Promise<ActionState | null> => {
    const [wsRow] = await tx
      .select({ name: workspaces.name, type: workspaces.type, status: workspaces.status })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1)
      .for('update');

    if (!wsRow) return { status: 'error', message: '워크스페이스를 찾을 수 없습니다. 새로고침해 주세요.' };
    if (wsRow.name !== confirmationName) return { status: 'error', message: '확인 이름이 현재 워크스페이스 이름과 다릅니다.' };
    if ((wsRow.type === 'buyer' ? '/buyers' : '/sellers') !== returnPath) return { status: 'error', message: '삭제 대상 유형이 일치하지 않습니다.' };

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

    // Explicitly remove restrictive FK chains in dependency order. RFP children
    // with CASCADE are removed by the database when their parent is deleted.
    const rfpIds = tx.select({ id: rfps.id }).from(rfps).where(eq(rfps.buyerWsId, workspaceId));
    const bidIds = tx.select({ id: bids.id }).from(bids).where(or(eq(bids.pgWsId, workspaceId), inArray(bids.rfpId, rfpIds)));
    await tx.delete(contracts).where(or(inArray(contracts.rfpId, rfpIds), inArray(contracts.bidId, bidIds)));
    await tx.delete(bids).where(or(eq(bids.pgWsId, workspaceId), inArray(bids.rfpId, rfpIds)));
    await tx.delete(rfpInvitations).where(or(eq(rfpInvitations.pgWsId, workspaceId), inArray(rfpInvitations.rfpId, rfpIds)));
    await tx.delete(rfps).where(eq(rfps.buyerWsId, workspaceId));
    await tx.delete(pgAgreementRates).where(eq(pgAgreementRates.pgWsId, workspaceId));

    // 워크스페이스 삭제 (workspace_members·workspace_invitations·columns 등 cascade FK는 DB가 처리)
    await tx.delete(workspaces).where(eq(workspaces.id, workspaceId));
    return null;
  });

  if (result) return result;
  redirect(safeListReturnTo(returnTo, returnPath));
}
