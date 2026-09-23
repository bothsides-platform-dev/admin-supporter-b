'use server';

import { eq, inArray, or } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { adminAuditLogs, bids, contracts, rfps } from '@/lib/db/schema';
import { requireAdminPermission } from '@/lib/auth/admin-session';
import { actionDb } from '@/lib/server/actions/auth/_shared';
import { safeListReturnTo } from '@/lib/admin-return-to';
import type { ActionState } from '@/lib/action-state';

export async function deleteRfpAction(rfpId: string, confirmationTitle: string, returnTo?: string): Promise<ActionState> {
  const session = await requireAdminPermission('rfp.delete');
  const result = await actionDb().transaction(async (tx): Promise<ActionState | null> => {
    const [rfp] = await tx.select({ code: rfps.code, title: rfps.title, status: rfps.status, buyerWsId: rfps.buyerWsId })
      .from(rfps).where(eq(rfps.id, rfpId)).limit(1).for('update');
    if (!rfp) return { status: 'error', message: 'RFP를 찾을 수 없습니다. 새로고침해 주세요.' };
    if (rfp.title !== confirmationTitle) return { status: 'error', message: '확인 제목이 현재 RFP 제목과 다릅니다.' };

    await tx.insert(adminAuditLogs).values({
      actor: session.adminId,
      action: 'rfp.hard_delete',
      entityType: 'rfp',
      entityId: rfpId,
      payloadJson: { snapshot: rfp },
    });

    // contracts.bid_id has a restrictive FK, so contracts must go before bids.
    const bidIds = tx.select({ id: bids.id }).from(bids).where(eq(bids.rfpId, rfpId));
    await tx.delete(contracts).where(or(eq(contracts.rfpId, rfpId), inArray(contracts.bidId, bidIds)));
    await tx.delete(bids).where(eq(bids.rfpId, rfpId));
    await tx.delete(rfps).where(eq(rfps.id, rfpId));
    return null;
  });

  if (result) return result;
  redirect(safeListReturnTo(returnTo, '/rfps'));
}
