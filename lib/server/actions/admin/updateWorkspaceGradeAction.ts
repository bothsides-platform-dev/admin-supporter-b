'use server';

import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { workspaces, bizProfiles, adminAuditLogs } from '@/lib/db/schema';
import { requireAdminSession } from '@/lib/auth/admin-session';
import { actionDb } from '@/lib/server/actions/auth/_shared';
import type { MerchantGrade } from '@/lib/types/biz-profile';

const VALID_GRADES: MerchantGrade[] = ['small', 'sme1', 'sme2', 'sme3', 'general'];

type Result = { ok: true } | { ok: false; error: string };

/**
 * admin이 워크스페이스(구매사·PG사)의 영중소구간(가맹점 등급)을 수정한다.
 *
 * biz_profiles는 불변 — 기존 행을 수정하지 않고 새 행을 INSERT한 뒤
 * workspaces.bizProfileId 포인터를 스왑한다(approveWorkspaceAction과 동일 패턴).
 * 기존 biz_profile이 있으면 bizNo/taxType/status를 복사하고 grade만 교체.
 * PG처럼 biz_profile이 없던 워크스페이스는 grade-only INSERT로 CHECK를 충족한다.
 * gradeConfirmedBy는 null — admin 세션 id가 users FK와 맞지 않으므로
 * 감사 로그(adminAuditLogs)가 source of truth.
 */
export async function updateWorkspaceGradeAction(
  workspaceId: string,
  grade: MerchantGrade,
): Promise<Result> {
  if (!VALID_GRADES.includes(grade)) return { ok: false, error: 'INVALID_GRADE' };

  const session = await requireAdminSession();
  const db = actionDb();
  const now = new Date();

  let error: string | null = null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await db.transaction(async (tx: any) => {
    const [ws] = await tx
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1);
    if (!ws) { error = 'WORKSPACE_NOT_FOUND'; return; }

    // 기존 biz_profile 필드 복사 + 현재 등급(before) 확보
    let prevGrade: MerchantGrade | null = null;
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
        prevGrade = existing.grade ?? null;
        existingBizNo = existing.bizNo ?? null;
        existingTaxType = existing.taxType ?? null;
        existingStatus = existing.status ?? null;
      }
    }

    // 동일 등급이면 새 행 생성 없이 멱등 통과
    if (prevGrade === grade) return;

    const newBizProfileId = randomUUID();
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

    await tx
      .update(workspaces)
      .set({ bizProfileId: newBizProfileId, updatedAt: now })
      .where(eq(workspaces.id, workspaceId));

    await tx.insert(adminAuditLogs).values({
      actor: session.adminId,
      action: 'workspace.grade_update',
      entityType: 'workspace',
      entityId: workspaceId,
      payloadJson: { before: { grade: prevGrade }, after: { grade } },
    });
  });

  if (error) return { ok: false, error };

  revalidatePath(`/buyers/${workspaceId}`);
  revalidatePath(`/sellers/${workspaceId}`);
  revalidatePath('/review');
  return { ok: true };
}
