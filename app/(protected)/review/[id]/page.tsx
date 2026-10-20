import { WorkspaceReviewInfo } from '@/components/WorkspaceReviewInfo';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { getApplicationDetail } from '@/lib/server/queries/admin/review';
import { SubmitButton } from '@/components/SubmitButton';
import { approveWorkspaceAction } from '@/lib/server/actions/admin/approveWorkspaceAction';
import { rejectWorkspaceAction } from '@/lib/server/actions/admin/rejectWorkspaceAction';
import { requestMoreInfoAction } from '@/lib/server/actions/admin/requestMoreInfoAction';
import { ActionForm } from '@/components/ActionForm';
import { toActionState, type ActionState } from '@/lib/action-state';
import { MERCHANT_TIER_LABELS, MERCHANT_TIERS } from '@/lib/types/biz-profile';
import type { MerchantTier } from '@/lib/types/biz-profile';
import { requireAdminSession } from '@/lib/auth/admin-session';
import { hasPermission } from '@/lib/auth/permissions';
import { getNextReviewApplicationId } from '@/lib/server/queries/admin/nextReview';
import type { ReviewSnapshot } from '@/lib/server/actions/admin/reviewApplication';

const ALL_GRADES: MerchantTier[] = [...MERCHANT_TIERS];

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
  const detail = await getApplicationDetail(id);

  if (!detail) notFound();

  const { application, workspace, bizProfile } = detail;

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
      <div className="flex items-center gap-3">
        <Link href={returnTo} className="text-on-surface-variant hover:text-on-surface text-body-small">
          ← 목록
        </Link>
        <h1 className="text-headline-small font-semibold">{workspace.name}</h1>
        <span className="text-label-small rounded bg-surface-container px-2 py-0.5">
          {application.orgType === 'buyer' ? '구매사' : 'PG사'}
        </span>
      </div>

      {/* Actions — submitted 또는 needs_more_info 상태에서만 표시 (위로 이동) */}
      {canAct && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-title-small font-medium">심사 처리</h2>
            <div className="flex items-center gap-2">
              <a
                href="https://bizno.net/"
                target="_blank"
                rel="noopener noreferrer"
                className="rounded border border-outline px-2 py-1 text-label-small hover:bg-surface-container-high"
              >
                비즈노(사업자정보 조회)
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
              <label className="block text-body-small text-on-surface-variant">반려 사유</label>
              <textarea
                name="reason"
                rows={3}
                required
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
              <label className="block text-body-small text-on-surface-variant">요청 사유</label>
              <textarea
                name="reason"
                rows={3}
                required
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
