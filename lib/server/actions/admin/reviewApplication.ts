import { and, desc, eq, inArray } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import {
  adminAuditLogs, bizProfiles, users, verificationApplications, workspaceMembers, workspaces,
} from '@/lib/db/schema';
import { requireAdminPermission } from '@/lib/auth/admin-session';
import { actionDb, appBaseUrl } from '@/lib/server/actions/auth/_shared';
import { DrizzleOutboxRepository } from '@/lib/server/repositories/drizzle/outbox';
import { renderWorkspaceApproved } from '@/lib/server/outbox/templates/workspaceApproved';
import { renderWorkspaceRejected } from '@/lib/server/outbox/templates/workspaceRejected';
import { flushAfterCommit } from '@/lib/server/outbox/post-commit';
import { MERCHANT_TIERS, type MerchantTier } from '@/lib/types/biz-profile';

type DB = ReturnType<typeof actionDb>;
export type ReviewResult = { ok: true } | { ok: false; error: string };
type Decision = 'approve' | 'reject' | 'needs_more_info';
const Id = z.string().uuid();
const Reason = z.string().trim().min(1).max(2000);
const Grade = z.enum(MERCHANT_TIERS);
const REVIEWABLE = ['submitted', 'review_pending', 'needs_more_info'] as const;
const Snapshot = z.object({
  status: z.enum(REVIEWABLE),
  reviewedAt: z.iso.datetime().nullable(),
  reason: z.string().nullable(),
}).strict();
export type ReviewSnapshot = z.infer<typeof Snapshot>;
const ORG_LABEL: Record<'buyer' | 'pg', string> = { buyer: '구매사', pg: 'PG사' };

export async function reviewApplication(
  db: DB,
  applicationId: unknown,
  decision: Decision,
  value?: unknown,
  expected?: unknown,
): Promise<ReviewResult> {
  const session = await requireAdminPermission('workspace.review');
  return reviewApplicationAs(db, session.adminId, applicationId, decision, value, expected);
}

async function reviewApplicationAs(
  db: DB,
  actor: string,
  applicationId: unknown,
  decision: Decision,
  value?: unknown,
  expected?: unknown,
  bulk = false,
): Promise<ReviewResult> {
  const id = Id.safeParse(applicationId);
  if (!id.success) return { ok: false, error: 'INVALID_INPUT' };
  const reason = decision === 'approve' ? null : Reason.safeParse(value);
  if (reason && !reason.success) return { ok: false, error: 'REASON_REQUIRED' };
  const grade = decision === 'approve' && value != null && value !== '' ? Grade.safeParse(value) : null;
  if (grade && !grade.success) return { ok: false, error: 'INVALID_GRADE' };
  const snapshot = bulk ? null : Snapshot.safeParse(expected);
  if (snapshot && !snapshot.success) return { ok: false, error: 'INVALID_INPUT' };

  const result = await db.transaction(async (tx) => {
    // This lock serializes two operators acting on the same application. The workspace
    // lock also protects its profile pointer and activation state.
    const [application] = await tx.select().from(verificationApplications)
      .where(eq(verificationApplications.id, id.data)).for('update');
    if (!application) return { ok: false as const, error: 'NOT_FOUND' };
    if (!REVIEWABLE.includes(application.status as typeof REVIEWABLE[number])) {
      return { ok: false as const, error: 'ALREADY_PROCESSED' };
    }
    if (bulk ? application.status === 'needs_more_info' :
      application.status !== snapshot?.data.status ||
      (application.reviewedAt?.toISOString() ?? null) !== snapshot?.data.reviewedAt ||
      application.reason !== snapshot?.data.reason) {
      return { ok: false as const, error: 'ALREADY_PROCESSED' };
    }
    const [workspace] = await tx.select().from(workspaces)
      .where(eq(workspaces.id, application.workspaceId)).for('update');
    if (!workspace) return { ok: false as const, error: 'WORKSPACE_NOT_FOUND' };
    if (workspace.type !== application.orgType) return { ok: false as const, error: 'INVALID_INPUT' };
    const [latest] = await tx.select({ id: verificationApplications.id })
      .from(verificationApplications)
      .where(eq(verificationApplications.workspaceId, workspace.id))
      .orderBy(desc(verificationApplications.submittedAt), desc(verificationApplications.id)).limit(1);
    if (latest?.id !== application.id) return { ok: false as const, error: 'ALREADY_PROCESSED' };
    if (decision === 'approve' && workspace.status === 'suspended') {
      return { ok: false as const, error: 'WORKSPACE_SUSPENDED' };
    }
    if (decision === 'approve' && workspace.type === 'buyer' && !grade) {
      return { ok: false as const, error: 'GRADE_REQUIRED' };
    }

    const now = new Date();
    const [owner] = await tx.select({ email: users.email, emailVerified: users.emailVerified })
      .from(workspaceMembers).innerJoin(users, eq(workspaceMembers.userId, users.id))
      .where(and(eq(workspaceMembers.workspaceId, workspace.id), eq(workspaceMembers.role, 'admin')))
      .limit(1);
    if (decision === 'approve' && owner && !owner.emailVerified) {
      return { ok: false as const, error: 'OWNER_EMAIL_NOT_VERIFIED' };
    }

    let newBizProfileId: string | null = null;
    let previousGrade: MerchantTier | null = null;
    if (decision === 'approve' && workspace.type === 'buyer' && grade?.success) {
      const current = workspace.bizProfileId
        ? (await tx.select().from(bizProfiles).where(eq(bizProfiles.id, workspace.bizProfileId)).limit(1))[0]
        : null;
      previousGrade = current?.grade ?? null;
      newBizProfileId = randomUUID();
      await tx.insert(bizProfiles).values({
        id: newBizProfileId,
        bizNo: current?.bizNo ?? null,
        taxType: current?.taxType ?? null,
        status: current?.status ?? null,
        grade: grade.data as MerchantTier,
        gradeSource: 'admin_confirmed',
        gradeConfirmedBy: null,
        gradeConfirmedAt: now,
      });
    }
    const nextStatus = decision === 'approve' ? 'approved' : decision === 'reject' ? 'rejected' : 'needs_more_info';
    const nextReason = reason?.success ? reason.data : null;
    await tx.update(verificationApplications).set({
      status: nextStatus,
      reviewedBy: actor,
      reviewedAt: now,
      reason: nextReason,
    }).where(and(eq(verificationApplications.id, application.id), inArray(verificationApplications.status, REVIEWABLE)));
    if (decision === 'approve') {
      await tx.update(workspaces).set({
        status: 'active', reviewedAt: now,
        ...(newBizProfileId ? { bizProfileId: newBizProfileId } : {}),
      }).where(eq(workspaces.id, workspace.id));
    }
    await tx.insert(adminAuditLogs).values({
      actor,
      action: decision === 'needs_more_info' ? 'workspace.needs_more_info' : `workspace.${decision}`,
      entityType: 'verification_application',
      entityId: application.id,
      payloadJson: {
        before: { status: application.status, reason: application.reason, workspaceStatus: workspace.status, ...(decision === 'approve' && workspace.type === 'buyer' ? { grade: previousGrade } : {}) },
        after: { status: nextStatus, reason: nextReason, workspaceStatus: decision === 'approve' ? 'active' : workspace.status, ...(grade?.success ? { grade: grade.data } : {}), workspaceId: workspace.id },
        ...(nextReason ? { reason: nextReason } : {}),
      },
    });
    if (owner && decision !== 'needs_more_info') {
      const orgType = workspace.type as 'buyer' | 'pg';
      const html = decision === 'approve'
        ? await renderWorkspaceApproved({ workspaceName: workspace.name, orgLabel: ORG_LABEL[orgType], loginUrl: `${appBaseUrl()}/login` })
        : await renderWorkspaceRejected({ workspaceName: workspace.name, orgLabel: ORG_LABEL[orgType], reason: nextReason!, reapplyUrl: `${appBaseUrl()}/signup/${orgType}` });
      await new DrizzleOutboxRepository(db).enqueue({
        event: decision === 'approve' ? 'workspace.approved' : 'workspace.rejected',
        to: owner.email,
        subject: decision === 'approve' ? '[서포트비] 가입이 승인되었습니다' : '[서포트비] 가입 심사 결과 — 보완이 필요합니다',
        html,
        dedupeKey: `workspace-${nextStatus}:${application.id}`,
      }, tx);
    }
    return { ok: true as const, workspaceId: workspace.id, workspaceType: workspace.type };
  });
  if (result.ok) {
    if (decision !== 'needs_more_info') flushAfterCommit();
    revalidatePath('/review');
    revalidatePath(`/review/${id.data}`);
    const workspacePath = result.workspaceType === 'buyer' ? '/buyers' : '/sellers';
    revalidatePath(workspacePath);
    revalidatePath(`${workspacePath}/${result.workspaceId}`);
    revalidatePath('/audit-log');
    revalidatePath('/');
  }
  return result.ok ? { ok: true } : result;
}

export async function bulkRequestMoreInfoAction(
  applicationIds: unknown,
  reason: unknown,
  db: DB = actionDb(),
): Promise<{ ok: true; processed: number; skipped: number } | { ok: false; error: string }> {
  const session = await requireAdminPermission('workspace.review');
  const ids = z.array(Id).min(1).max(50).safeParse(applicationIds);
  const parsedReason = Reason.safeParse(reason);
  if (!ids.success || new Set(ids.data).size !== ids.data.length) return { ok: false, error: 'INVALID_INPUT' };
  if (!parsedReason.success) return { ok: false, error: 'REASON_REQUIRED' };
  let processed = 0;
  for (const id of ids.data) {
    const result = await reviewApplicationAs(db, session.adminId, id, 'needs_more_info', parsedReason.data, undefined, true);
    if (result.ok) processed++;
  }
  return { ok: true, processed, skipped: ids.data.length - processed };
}
