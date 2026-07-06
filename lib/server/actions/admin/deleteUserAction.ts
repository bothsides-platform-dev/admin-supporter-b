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
} from '@/lib/db/schema';
import { requireSuperAdmin } from '@/lib/auth/admin-session';
import { actionDb } from '@/lib/server/actions/auth/_shared';

export async function deleteUserAction(userId: string): Promise<void> {
  const session = await requireSuperAdmin();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await actionDb().transaction(async (tx: any) => {
    const [userRow] = await tx
      .select({ email: users.email, name: users.name })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

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

    // rfp_requote_requests.created_by_user_id — NOT NULL, 해당 행 삭제
    await tx
      .delete(rfpRequoteRequests)
      .where(eq(rfpRequoteRequests.createdByUserId, userId));

    // attachments.uploaded_by — NOT NULL, 해당 첨부파일 삭제
    // (바이트는 Cloudflare R2에 있음 — 이 delete는 DB row만 지우며 R2 객체는
    // 정리되지 않고 고아로 남는다. R2 정리는 별도 인프라 작업 필요.)
    await tx.delete(attachments).where(eq(attachments.uploadedBy, userId));

    // contracts.awarded_by — NOT NULL, 해당 계약 삭제
    await tx.delete(contracts).where(eq(contracts.awardedBy, userId));

    // 유저 삭제 (workspace_members, notifications 등 cascade FK는 DB가 처리)
    await tx.delete(users).where(eq(users.id, userId));
  });

  redirect('/users');
}
