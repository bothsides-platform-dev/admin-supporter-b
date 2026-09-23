'use server';

import { eq, sql } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import {
  users,
  adminAuditLogs,
  workspaceInvitations,
  bidQuoteTemplates,
  rfpRequoteRequests,
  attachments,
  contracts,
  bids,
  rfps,
  chatMessages,
  chatMessageTemplates,
  bidNotes,
  rfpTeamMessages,
  rfpPgRequests,
} from '@/lib/db/schema';
import { requireAdminPermission } from '@/lib/auth/admin-session';
import { actionDb } from '@/lib/server/actions/auth/_shared';
import type { ActionState } from '@/lib/action-state';
import { safeListReturnTo } from '@/lib/admin-return-to';

export async function deleteUserAction(userId: string, confirmationName: string, returnTo?: string): Promise<ActionState> {
  const session = await requireAdminPermission('user.delete');

  const result = await actionDb().transaction(async (tx): Promise<ActionState | null> => {
    const [userRow] = await tx
      .select({ email: users.email, name: users.name })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)
      .for('update');

    if (!userRow) return { status: 'error', message: '회원을 찾을 수 없습니다. 새로고침해 주세요.' };
    if (userRow.name !== confirmationName) return { status: 'error', message: '확인 이름이 현재 회원 이름과 다릅니다.' };
    // These records belong to other users/workspaces too. Erasing them to remove an
    // account would destroy transaction and communication history.
    const protectedTables = [
      [rfps, rfps.createdBy], [bids, bids.submittedBy], [contracts, contracts.awardedBy],
      [attachments, attachments.uploadedBy], [rfpRequoteRequests, rfpRequoteRequests.createdByUserId],
      [chatMessages, chatMessages.authorUserId],
      [chatMessageTemplates, chatMessageTemplates.createdBy], [bidNotes, bidNotes.authorId],
      [rfpTeamMessages, rfpTeamMessages.authorUserId], [rfpPgRequests, rfpPgRequests.createdByUserId],
    ] as const;
    for (const [table, column] of protectedTables) {
      const existing = await tx.select({ id: column }).from(table).where(eq(column, userId)).limit(1);
      if (existing.length) return { status: 'error', message: '이 회원과 연결된 보존 대상 업무 기록이 있어 삭제할 수 없습니다.' };
    }

    await tx.insert(adminAuditLogs).values({
      actor: session.adminId,
      action: 'user.hard_delete',
      entityType: 'user',
      entityId: userId,
      payloadJson: {
        snapshot: { email: userRow?.email, name: userRow?.name },
      },
    });

    // users.id를 NOT NULL FK로 참조하는 테이블을 먼저 처리한다.
    // ON DELETE CASCADE가 없어서 유저 삭제 전에 직접 정리해야 한다.

    // biz_profiles.grade_confirmed_by — nullable, SET NULL
    await tx.execute(
      sql`UPDATE biz_profiles SET grade_confirmed_by = NULL WHERE grade_confirmed_by = ${userId}::uuid`,
    );

    // workspace_invitations.invited_by_user_id — NOT NULL, 해당 초대 삭제
    await tx
      .delete(workspaceInvitations)
      .where(eq(workspaceInvitations.invitedByUserId, userId));

    // bid_quote_templates.created_by — NOT NULL, 해당 템플릿 삭제
    await tx.delete(bidQuoteTemplates).where(eq(bidQuoteTemplates.createdBy, userId));

    // 유저 삭제 (workspace_members, notifications 등 cascade FK는 DB가 처리)
    await tx.delete(users).where(eq(users.id, userId));
    return null;
  });

  if (result) return result;
  redirect(safeListReturnTo(returnTo, '/users'));
}
