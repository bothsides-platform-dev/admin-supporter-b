'use server';

import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import {
  workspaces,
  verificationApplications,
  adminAuditLogs,
  workspaceMembers,
  users,
  bizProfiles,
} from '@/lib/db/schema';
import { requireAdminSession } from '@/lib/auth/admin-session';
import { actionDb, appBaseUrl } from '@/lib/server/actions/auth/_shared';
import { DrizzleOutboxRepository } from '@/lib/server/repositories/drizzle/outbox';
import { renderWorkspaceApproved } from '@/lib/server/outbox/templates/workspaceApproved';
import { flushAfterCommit } from '@/lib/server/outbox/post-commit';
import type { MerchantTier } from '@/lib/types/biz-profile';

type DB = ReturnType<typeof actionDb>;

const ORG_LABEL: Record<'buyer' | 'pg', string> = {
  buyer: '구매사',
  pg: 'PG사',
};

/**
 * admin이 workspace를 승인한다.
 *
 * buyer 워크스페이스인 경우:
 *   - grade 필수. biz_profiles 행을 INSERT(기존 bizNo/taxType/status 복사 +
 *     grade + gradeSource:'admin_confirmed')하고 workspaces.bizProfileId를 스왑.
 *   - biz_profiles가 없는 레거시 row는 grade-only INSERT로 CHECK 충족.
 *   - gradeConfirmedBy는 null — admin 세션 id가 users FK와 맞지 않으므로
 *     감사 로그(adminAuditLogs payload)가 source of truth.
 * pg 워크스페이스인 경우 grade 없이 승인.
 */
export async function approveWorkspaceAction(
  db: DB = actionDb(),
  workspaceId: string,
  grade?: MerchantTier,
) {
  const session = await requireAdminSession();
  const now = new Date();
  const outbox = new DrizzleOutboxRepository(db);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await db.transaction(async (tx: any) => {
    // workspace 조회 — type + 현재 bizProfileId 확인
    const [ws] = await tx
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1);

    if (!ws) throw new Error(`workspace not found: ${workspaceId}`);

    // 이메일 인증 게이트 — 인증된 유저만 승인한다(요구사항). 오너(admin 멤버)가
    // 존재하고 이메일 미인증이면 승인을 차단한다. 오너가 없는 레거시 row 는
    // 기존 관용(승인 메일 skip 과 동일)대로 통과시킨다.
    const [owner] = await tx
      .select({ emailVerified: users.emailVerified })
      .from(workspaceMembers)
      .innerJoin(users, eq(workspaceMembers.userId, users.id))
      .where(
        and(
          eq(workspaceMembers.workspaceId, workspaceId),
          eq(workspaceMembers.role, 'admin'),
        ),
      )
      .limit(1);
    if (owner && !owner.emailVerified) {
      throw new Error('OWNER_EMAIL_NOT_VERIFIED');
    }

    // buyer 승인 시 grade 필수
    if (ws.type === 'buyer') {
      if (!grade) throw new Error('GRADE_REQUIRED');
    }

    // buyer: 새 biz_profiles 행 INSERT + bizProfileId 스왑 (불변 패턴)
    let newBizProfileId: string | null = null;
    if (ws.type === 'buyer' && grade) {
      // 기존 biz_profiles 행이 있으면 bizNo/taxType/status 복사
      let existingBizNo: string | null = null;
      let existingTaxType: string | null = null;
      let existingStatus: string | null = null;
      if (ws.bizProfileId) {
        const [existing] = await tx
          .select()
          .from(bizProfiles)
          .where(eq(bizProfiles.id, ws.bizProfileId))
          .limit(1);
        if (existing) {
          existingBizNo = existing.bizNo ?? null;
          existingTaxType = existing.taxType ?? null;
          existingStatus = existing.status ?? null;
        }
      }

      newBizProfileId = randomUUID();
      await tx.insert(bizProfiles).values({
        id: newBizProfileId,
        bizNo: existingBizNo,
        taxType: existingTaxType,
        status: existingStatus,
        grade,
        gradeSource: 'admin_confirmed',
        gradeConfirmedBy: null, // admin FK는 users 테이블 아님 → 감사로그로 기록
        gradeConfirmedAt: now,
      });
    }

    await tx.update(workspaces)
      .set({
        status: 'active',
        reviewedAt: now,
        ...(newBizProfileId ? { bizProfileId: newBizProfileId } : {}),
      })
      .where(eq(workspaces.id, workspaceId));

    await tx.update(verificationApplications)
      .set({ status: 'approved', reviewedBy: session.adminId, reviewedAt: now })
      .where(eq(verificationApplications.workspaceId, workspaceId));

    await tx.insert(adminAuditLogs).values({
      actor: session.adminId,
      action: 'workspace.approve',
      entityType: 'workspace',
      entityId: workspaceId,
      payloadJson: {
        after: { status: 'active' },
        ...(grade ? { grade } : {}),
      },
    });

    // 승인 완료 이메일 — 신청자(admin 역할 멤버)에게 발송.
    // 멤버가 없는 경우(레거시 데이터 등)는 조용히 스킵한다.
    const [ownerRow] = await tx
      .select({
        email: users.email,
        wsName: workspaces.name,
        wsType: workspaces.type,
      })
      .from(workspaceMembers)
      .innerJoin(users, eq(workspaceMembers.userId, users.id))
      .innerJoin(workspaces, eq(workspaceMembers.workspaceId, workspaces.id))
      .where(
        and(
          eq(workspaceMembers.workspaceId, workspaceId),
          eq(workspaceMembers.role, 'admin'),
        ),
      )
      .limit(1);

    if (ownerRow) {
      const html = await renderWorkspaceApproved({
        workspaceName: ownerRow.wsName,
        orgLabel: ORG_LABEL[ownerRow.wsType as 'buyer' | 'pg'],
        loginUrl: `${appBaseUrl()}/login`,
      });
      await outbox.enqueue(
        {
          event: 'workspace.approved',
          to: ownerRow.email,
          subject: '[Support B] 가입이 승인되었습니다',
          html,
          dedupeKey: `workspace-approved:${workspaceId}`,
        },
        tx,
      );
    }
  });

  flushAfterCommit();
  revalidatePath('/review');
  revalidatePath('/');
}
