'use server';

import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { workspaceMembers, adminAuditLogs, users, workspaces } from '@/lib/db/schema';
import { requireAdminSession } from '@/lib/auth/admin-session';
import { actionDb } from '@/lib/server/actions/auth/_shared';
import { DrizzleOutboxRepository } from '@/lib/server/repositories/drizzle/outbox';
import { renderMembershipRejected } from '@/lib/server/outbox/templates/membershipRejected';
import { flushAfterCommit } from '@/lib/server/outbox/post-commit';

type DB = ReturnType<typeof actionDb>;
type Result = { ok: true } | { ok: false; error: string };

export async function rejectMemberAction(
  db: DB = actionDb(),
  workspaceId: string,
  userId: string,
): Promise<Result> {
  const session = await requireAdminSession();
  const outbox = new DrizzleOutboxRepository(db);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await db.transaction(async (tx: any) => {
    const updated = await tx
      .update(workspaceMembers)
      .set({ approvalStatus: 'rejected' })
      .where(
        and(
          eq(workspaceMembers.workspaceId, workspaceId),
          eq(workspaceMembers.userId, userId),
          eq(workspaceMembers.approvalStatus, 'pending_approval'),
        ),
      )
      .returning({ id: workspaceMembers.userId });

    if (updated.length === 0) return;

    await tx.insert(adminAuditLogs).values({
      actor: session.adminId,
      action: 'membership.reject',
      entityType: 'workspace_member',
      entityId: workspaceId,
      payloadJson: { after: { approvalStatus: 'rejected' }, userId },
    });

    // 거부 결과 이메일 — 합류 담당자에게 발송.
    const [memberRow] = await tx
      .select({
        email: users.email,
        wsName: workspaces.name,
      })
      .from(workspaceMembers)
      .innerJoin(users, eq(workspaceMembers.userId, users.id))
      .innerJoin(workspaces, eq(workspaceMembers.workspaceId, workspaces.id))
      .where(
        and(
          eq(workspaceMembers.workspaceId, workspaceId),
          eq(workspaceMembers.userId, userId),
        ),
      )
      .limit(1);

    if (memberRow) {
      const html = await renderMembershipRejected({
        workspaceName: memberRow.wsName,
      });
      await outbox.enqueue(
        {
          event: 'membership.rejected',
          to: memberRow.email,
          subject: '[서포트비] 담당자 계정 합류 요청 결과 안내',
          html,
          dedupeKey: `membership-rejected:${workspaceId}:${userId}`,
        },
        tx,
      );
    }
  });

  flushAfterCommit();
  revalidatePath('/admin/pg-members');
  return { ok: true };
}
