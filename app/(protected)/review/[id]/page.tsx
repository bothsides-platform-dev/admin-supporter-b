import { WorkspaceReviewInfo } from '@/components/WorkspaceReviewInfo';
import { cache } from 'react';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { AdminPageHeader } from '@/components/AdminPageHeader';
import { CopyableValue } from '@/components/CopyableValue';
import { ReasonTemplatePicker } from '@/components/ReasonTemplatePicker';
import { MORE_INFO_REASON_TEMPLATES, REJECT_REASON_TEMPLATES } from '@/lib/review-reason-templates';
import { AdminStatusBadge } from '@/components/AdminStatusBadge';
import { getApplicationDetail } from '@/lib/server/queries/admin/review';
import { SubmitButton } from '@/components/SubmitButton';
import { approveWorkspaceAction } from '@/lib/server/actions/admin/approveWorkspaceAction';
import { rejectWorkspaceAction } from '@/lib/server/actions/admin/rejectWorkspaceAction';
import { requestMoreInfoAction } from '@/lib/server/actions/admin/requestMoreInfoAction';
import { ActionForm } from '@/components/ActionForm';
import { toActionState, type ActionState } from '@/lib/action-state';
import { MERCHANT_TIER_LABELS, MERCHANT_TIERS } from '@/lib/types/biz-profile';
import type { MerchantTier } from '@/lib/types/biz-profile';
import { normalizeBizNo } from '@/lib/biz-no';
import { requireAdminSession } from '@/lib/auth/admin-session';
import { hasPermission } from '@/lib/auth/permissions';
import { getNextReviewApplicationId } from '@/lib/server/queries/admin/nextReview';
import type { ReviewSnapshot } from '@/lib/server/actions/admin/reviewApplication';

const ALL_GRADES: MerchantTier[] = [...MERCHANT_TIERS];

// generateMetadata 와 본문이 같은 조회를 한 번만 하도록 요청 단위로 캐시한다.
const loadApplication = cache((id: string) => getApplicationDetail(id));

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const detail = await loadApplication((await params).id);
  return { title: detail ? `${detail.workspace.name} 심사` : '입점 심사' };
}

export default async function ReviewDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const { id } = await params;
  const { returnTo: rawReturnTo } = await searchParams;
  const returnTo = typeof rawReturnTo === 'string' &&
    (rawReturnTo === '/review' || rawReturnTo.startsWith('/review?'))
    ? rawReturnTo : '/review';
  const session = await requireAdminSession();
  const canReview = hasPermission(session, 'workspace.review');
  const canWriteNotes = hasPermission(session, 'notes.write');
  const detail = await loadApplication(id);

  if (!detail) notFound();

  const { application, workspace, bizProfile, pgProfile } = detail;
  const bizNo = normalizeBizNo(application.orgType === 'buyer' ? bizProfile?.bizNo : pgProfile?.bizNo);
  const moneypinUrl = bizNo ? `https://moneypin.biz/bizno/detail/${bizNo}/` : null;

  const canAct =
    canReview && ['submitted', 'review_pending', 'needs_more_info'].includes(application.status);
  const reviewSnapshot: ReviewSnapshot = {
    status: application.status as ReviewSnapshot['status'],
    reviewedAt: application.reviewedAt?.toISOString() ?? null,
    reason: application.reason,
  };

  async function goToNextIfRequested(formData: FormData) {
    'use server';
    if (formData.get('next') !== '1') return;
    const nextId = await getNextReviewApplicationId(id, returnTo);
    redirect(nextId ? `/review/${nextId}?returnTo=${encodeURIComponent(returnTo)}` : returnTo);
  }

  async function skipToNext() {
    'use server';
    const nextId = await getNextReviewApplicationId(id, returnTo, undefined, { skip: true });
    redirect(nextId ? `/review/${nextId}?returnTo=${encodeURIComponent(returnTo)}` : returnTo);
  }

  async function approveAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
    'use server';
    const gradeRaw = formData.get('grade');
    const grade = gradeRaw ? (gradeRaw as MerchantTier) : undefined;
    const result = await approveWorkspaceAction(undefined, application.id, grade, reviewSnapshot);
    if (result.ok) await goToNextIfRequested(formData);
    return toActionState(result, '승인했습니다.');
  }

  async function rejectAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
    'use server';
    const reason = String(formData.get('reason') ?? '').trim();
    const result = await rejectWorkspaceAction(undefined, application.id, reason, reviewSnapshot);
    if (result.ok) await goToNextIfRequested(formData);
    return toActionState(result, '반려했습니다.');
  }

  async function moreInfoAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
    'use server';
    const reason = String(formData.get('reason') ?? '').trim();
    const result = await requestMoreInfoAction(undefined, application.id, reason, reviewSnapshot);
    if (result.ok) await goToNextIfRequested(formData);
    return toActionState(result, '보완 요청을 보냈습니다.');
  }


  return (
    <div className="space-y-6 max-w-3xl">
      <AdminPageHeader
        title={workspace.name}
        breadcrumbs={[{ label: '입점 심사', href: returnTo }]}
        badges={<>
          <span className="text-label-small rounded bg-surface-container px-2 py-0.5">
            {application.orgType === 'buyer' ? '구매사' : 'PG사'}
          </span>
          <AdminStatusBadge status={application.status} />
        </>}
        meta={<span>신청 ID <CopyableValue value={application.id} label="신청 ID" numeric /></span>}
      >
        {canReview && (
          <form action={skipToNext}>
            <SubmitButton className="rounded border border-outline px-3 py-1.5 text-label-small hover:bg-surface-container-low">건너뛰고 다음 대기 건</SubmitButton>
          </form>
        )}
      </AdminPageHeader>

      {/* Actions — submitted 또는 needs_more_info 상태에서만 표시 (위로 이동) */}
      {canAct && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="shrink-0 text-title-small font-medium">심사 처리</h2>
            <div className="flex flex-wrap items-center gap-2">
              <a
                href={moneypinUrl ?? 'https://moneypin.biz/bizno/'}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded border border-outline px-2 py-1 text-label-small hover:bg-surface-container-high"
              >
                {moneypinUrl ? '머니핀(사업자정보 조회)' : '머니핀(사업자번호 확인 필요)'}
              </a>
              <a
                href="https://www.pay2pay.co.kr/board/view?bId=faq&wr_id=3779"
                target="_blank"
                rel="noopener noreferrer"
                className="rounded border border-outline px-2 py-1 text-label-small hover:bg-surface-container-high"
              >
                페이투페이(사업자 등급 조회)
              </a>
            </div>
          </div>

          {/* 승인 카드 */}
          <div className="rounded border border-primary p-4 space-y-3">
            <h3 className="text-body-medium font-medium text-primary">승인</h3>
            <ActionForm action={approveAction} className="space-y-3">
              {application.orgType === 'buyer' && (
                <div className="space-y-1">
                  <label
                    htmlFor="grade-select"
                    className="block text-body-small text-on-surface-variant"
                  >
                    가맹점 등급 <span className="text-error">*</span>
                  </label>
                  <select
                    id="grade-select"
                    name="grade"
                    required
                    defaultValue={bizProfile?.grade ?? ''}
                    className="rounded border border-outline px-3 py-2 text-body-small bg-surface focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="" disabled>등급 선택</option>
                    {ALL_GRADES.map((g) => (
                      <option key={g} value={g}>
                        {MERCHANT_TIER_LABELS[g]}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <SubmitButton className="rounded bg-primary px-4 py-2 text-label-large text-on-primary hover:bg-primary/90">
                승인
              </SubmitButton>
              <button type="submit" name="next" value="1" className="ml-2 rounded border border-primary px-4 py-2 text-label-large text-primary">승인 후 다음 대기 건</button>
            </ActionForm>
          </div>

          {/* 반려 카드 */}
          <div className="rounded border border-error p-4 space-y-3">
            <h3 className="text-body-medium font-medium text-error">반려</h3>
            <ActionForm action={rejectAction} className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label htmlFor="reject-reason" className="block text-body-small text-on-surface-variant">반려 사유</label>
                <ReasonTemplatePicker templates={REJECT_REASON_TEMPLATES} label="자주 쓰는 반려 사유" />
              </div>
              <textarea
                name="reason"
                rows={3}
                required
                id="reject-reason"
                placeholder="반려 사유를 입력하세요"
                className="w-full rounded border border-outline px-3 py-2 text-body-small bg-surface resize-none focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <SubmitButton className="rounded border border-error px-4 py-2 text-label-large text-error hover:bg-error-container">
                반려
              </SubmitButton>
              <button type="submit" name="next" value="1" className="ml-2 rounded border border-error px-4 py-2 text-label-large text-error">반려 후 다음 대기 건</button>
            </ActionForm>
          </div>

          {/* 보완 요청 / 재요청 카드 */}
          <div className="rounded border border-outline-variant p-4 space-y-3">
            <h3 className="text-body-medium font-medium text-on-surface">
              {application.status === 'needs_more_info' ? '재요청' : '보완 요청'}
            </h3>
            <ActionForm action={moreInfoAction} className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label htmlFor="more-info-reason" className="block text-body-small text-on-surface-variant">요청 사유</label>
                <ReasonTemplatePicker templates={MORE_INFO_REASON_TEMPLATES} label="자주 쓰는 보완 사유" />
              </div>
              <textarea
                name="reason"
                rows={3}
                required
                id="more-info-reason"
                placeholder="요청 사유를 입력하세요"
                className="w-full rounded border border-outline px-3 py-2 text-body-small bg-surface resize-none focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <SubmitButton className="rounded border border-outline px-4 py-2 text-label-large text-on-surface hover:bg-surface-container-low">
                {application.status === 'needs_more_info' ? '재요청' : '보완 요청'}
              </SubmitButton>
              <button type="submit" name="next" value="1" className="ml-2 rounded border border-outline px-4 py-2 text-label-large">요청 후 다음 대기 건</button>
            </ActionForm>
          </div>
        </section>
      )}

      <WorkspaceReviewInfo
        {...detail}
        canWriteNotes={canWriteNotes}
        revalidatePath={`/review/${id}`}
      />
    </div>
  );
}
