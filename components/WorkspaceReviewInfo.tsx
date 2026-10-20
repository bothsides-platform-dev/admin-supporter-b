import { AdminStatusBadge } from '@/components/AdminStatusBadge';
import { ActionForm } from '@/components/ActionForm';
import { ConfirmButton } from '@/components/ConfirmButton';
import { SubmitButton } from '@/components/SubmitButton';
import { getAdminNotes } from '@/lib/server/queries/admin/adminNotes';
import { getApplicationReviewHistory } from '@/lib/server/queries/admin/reviewHistory';
import type { getApplicationDetail } from '@/lib/server/queries/admin/review';
import { createAdminNoteAction } from '@/lib/server/actions/admin/createAdminNoteAction';
import { deleteAdminNoteAction } from '@/lib/server/actions/admin/deleteAdminNoteAction';
import { toActionState, type ActionState } from '@/lib/action-state';
import { MERCHANT_TIER_LABELS, type MerchantTier } from '@/lib/types/biz-profile';
import { formatKST } from '@/lib/utils';

type Detail = NonNullable<Awaited<ReturnType<typeof getApplicationDetail>>>;
type Props = {
  workspace: Pick<Detail['workspace'], 'id' | 'type' | 'status'>;
  bizProfile: Pick<NonNullable<Detail['bizProfile']>, 'bizNo' | 'grade'> | null;
  ownerContact: Detail['ownerContact'];
  application: Pick<Detail['application'], 'id' | 'status' | 'submittedAt'> | null;
  pgProfile?: Detail['pgProfile'];
  canWriteNotes: boolean;
  revalidatePath: string;
};

/** Shared information shown during review and after onboarding. */
export async function WorkspaceReviewInfo({
  application, workspace, bizProfile, pgProfile, ownerContact, canWriteNotes, revalidatePath,
}: Props) {
  const [notes, reviewHistory] = await Promise.all([
    getAdminNotes('workspace', workspace.id),
    application ? getApplicationReviewHistory(application.id) : Promise.resolve([]),
  ]);

  async function saveNote(_prev: ActionState, formData: FormData): Promise<ActionState> {
    'use server';
    const body = String(formData.get('body') ?? '').trim();
    return toActionState(
      await createAdminNoteAction(undefined, 'workspace', workspace.id, body, revalidatePath),
      '메모를 저장했습니다.',
    );
  }

  return (
    <>
      {/* Application Info */}
      {application && <section className="rounded border border-outline-variant">
        <div className="border-b border-outline-variant px-4 py-2 bg-surface-container-low">
          <h2 className="text-title-small font-medium">신청 정보</h2>
        </div>
        <div className="px-4 py-3 grid grid-cols-2 gap-3 text-body-small">
          <div>
            <span className="text-on-surface-variant">신청일</span>
            <span className="ml-3 md-numeric">{formatKST(application.submittedAt)}</span>
          </div>
          <div>
            <span className="text-on-surface-variant">상태</span>
            <span className="ml-3"><AdminStatusBadge status={application.status} /></span>
          </div>
          <div>
            <span className="text-on-surface-variant">워크스페이스 상태</span>
            <span className="ml-3"><AdminStatusBadge status={workspace.status} /></span>
          </div>
        </div>
      </section>}

      <section className="rounded border border-outline-variant">
        <div className="border-b border-outline-variant px-4 py-2 bg-surface-container-low">
          <h2 className="text-title-small font-medium">처리 이력</h2>
        </div>
        {reviewHistory.length === 0 ? (
          <p className="px-4 py-3 text-body-small text-on-surface-variant">기록된 처리 이력이 없습니다.</p>
        ) : (
          <ol className="divide-y divide-outline-variant">
            {reviewHistory.map((entry) => (
              <li key={entry.id} className="px-4 py-3 space-y-1 text-body-small">
                <div className="flex flex-wrap items-center gap-2">
                  <AdminStatusBadge status={String(entry.payloadJson?.after?.status ?? '')} />
                  <span className="text-on-surface-variant">{entry.actor}, {formatKST(entry.occurredAt)}</span>
                </div>
                {entry.payloadJson?.reason && <p className="whitespace-pre-wrap">사유: {entry.payloadJson.reason}</p>}
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* Buyer biz profile (구매사 only) */}
      {workspace.type === 'buyer' && bizProfile && (
        <section className="rounded border border-outline-variant">
          <div className="border-b border-outline-variant px-4 py-2 bg-surface-container-low">
            <h2 className="text-title-small font-medium">사업자 정보</h2>
          </div>
          <div className="px-4 py-3 grid grid-cols-2 gap-3 text-body-small">
            {bizProfile.bizNo && (
              <div>
                <span className="text-on-surface-variant">사업자번호</span>
                <span className="ml-3 md-numeric">{bizProfile.bizNo}</span>
              </div>
            )}
            {bizProfile.grade && (
              <div>
                <span className="text-on-surface-variant">현재 등급</span>
                <span className="ml-3">{MERCHANT_TIER_LABELS[bizProfile.grade as MerchantTier]}</span>
              </div>
            )}
            {ownerContact && (
              <div className="col-span-2 flex flex-wrap items-center gap-2">
                <span className="text-on-surface-variant">담당자</span>
                <span>
                  {ownerContact.name}, {ownerContact.email}, {ownerContact.phone ?? '—'}
                </span>
                {ownerContact.emailVerified ? (
                  <span className="rounded bg-tertiary/15 px-2 py-0.5 text-label-small text-tertiary">
                    이메일 인증됨
                  </span>
                ) : (
                  <span className="rounded bg-error/15 px-2 py-0.5 text-label-small text-error">
                    이메일 미인증
                  </span>
                )}
              </div>
            )}
          </div>
        </section>
      )}

      {/* PG Profile (판매사 only) */}
      {workspace.type === 'pg' && pgProfile && (
        <section className="rounded border border-outline-variant">
          <div className="border-b border-outline-variant px-4 py-2 bg-surface-container-low">
            <h2 className="text-title-small font-medium">PG 프로필</h2>
          </div>
          <div className="px-4 py-3 grid grid-cols-2 gap-3 text-body-small">
            {pgProfile.bizNo && (
              <div>
                <span className="text-on-surface-variant">사업자번호</span>
                <span className="ml-3 md-numeric">{pgProfile.bizNo}</span>
              </div>
            )}
            {pgProfile.slaDays != null && (
              <div>
                <span className="text-on-surface-variant">SLA (일)</span>
                <span className="ml-3 md-numeric">{pgProfile.slaDays}</span>
              </div>
            )}
            {pgProfile.serviceScope?.paymentMethods && (
              <div className="col-span-2">
                <span className="text-on-surface-variant">결제 수단</span>
                <span className="ml-3">{pgProfile.serviceScope.paymentMethods.join(', ')}</span>
              </div>
            )}
            {pgProfile.serviceScope?.industries && (
              <div className="col-span-2">
                <span className="text-on-surface-variant">업종</span>
                <span className="ml-3">{pgProfile.serviceScope.industries.join(', ')}</span>
              </div>
            )}
            {ownerContact && (
              <div className="col-span-2 flex flex-wrap items-center gap-2">
                <span className="text-on-surface-variant">담당자</span>
                <span>
                  {ownerContact.name}, {ownerContact.email}, {ownerContact.phone ?? '—'}
                </span>
                {ownerContact.emailVerified ? (
                  <span className="rounded bg-tertiary/15 px-2 py-0.5 text-label-small text-tertiary">
                    이메일 인증됨
                  </span>
                ) : (
                  <span className="rounded bg-error/15 px-2 py-0.5 text-label-small text-error">
                    이메일 미인증
                  </span>
                )}
              </div>
            )}
          </div>
        </section>
      )}

      {/* 가입 유입 경로 (신청 유저 = 담당자 signupSource) */}
      <section className="rounded border border-outline-variant">
        <div className="border-b border-outline-variant px-4 py-2 bg-surface-container-low">
          <h2 className="text-title-small font-medium">가입 유입 경로</h2>
        </div>
        <div className="px-4 py-3 grid grid-cols-2 gap-3 text-body-small">
          {!ownerContact?.signupSource.utmSource &&
          !ownerContact?.signupSource.utmMedium &&
          !ownerContact?.signupSource.utmCampaign &&
          !ownerContact?.signupSource.utmTerm &&
          !ownerContact?.signupSource.utmContent &&
          !ownerContact?.signupSource.referrer &&
          !ownerContact?.signupSource.landingPath ? (
            <p className="col-span-2 text-on-surface-variant">유입 정보 없음</p>
          ) : (
            <>
              {ownerContact.signupSource.utmSource && (
                <div>
                  <span className="text-on-surface-variant">유입 소스</span>
                  <span className="ml-3">{ownerContact.signupSource.utmSource}</span>
                </div>
              )}
              {ownerContact.signupSource.utmMedium && (
                <div>
                  <span className="text-on-surface-variant">매체</span>
                  <span className="ml-3">{ownerContact.signupSource.utmMedium}</span>
                </div>
              )}
              {ownerContact.signupSource.utmCampaign && (
                <div>
                  <span className="text-on-surface-variant">캠페인</span>
                  <span className="ml-3">{ownerContact.signupSource.utmCampaign}</span>
                </div>
              )}
              {ownerContact.signupSource.utmTerm && (
                <div>
                  <span className="text-on-surface-variant">검색어</span>
                  <span className="ml-3">{ownerContact.signupSource.utmTerm}</span>
                </div>
              )}
              {ownerContact.signupSource.utmContent && (
                <div>
                  <span className="text-on-surface-variant">콘텐츠</span>
                  <span className="ml-3">{ownerContact.signupSource.utmContent}</span>
                </div>
              )}
              {ownerContact.signupSource.referrer && (
                <div className="col-span-2">
                  <span className="text-on-surface-variant">외부 유입 referrer</span>
                  <span className="ml-3 break-all">{ownerContact.signupSource.referrer}</span>
                </div>
              )}
              {ownerContact.signupSource.landingPath && (
                <div className="col-span-2">
                  <span className="text-on-surface-variant">최초 진입 경로</span>
                  <span className="ml-3 break-all">{ownerContact.signupSource.landingPath}</span>
                </div>
              )}
              {ownerContact.signupSource.capturedAt && (
                <div>
                  <span className="text-on-surface-variant">캡처 시각</span>
                  <span className="ml-3 md-numeric">
                    {formatKST(ownerContact.signupSource.capturedAt)}
                  </span>
                </div>
              )}
            </>
          )}
        </div>
      </section>

      {/* 어드민 노트 */}
      <section className="space-y-3">
        <h2 className="text-title-small font-medium">어드민 노트</h2>

        {notes.length === 0 ? (
          <p className="text-body-small text-on-surface-variant">노트가 없습니다.</p>
        ) : (
          <div className="rounded border border-outline-variant divide-y divide-outline-variant overflow-hidden">
            {notes.map((note) => {
              async function doDeleteNote() {
                'use server';
                return toActionState(await deleteAdminNoteAction(note.id, revalidatePath), '노트를 삭제했습니다.');
              }
              return (
                <div key={note.id} className="px-4 py-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-label-small text-on-surface-variant">
                      {note.createdBy}, {formatKST(note.createdAt)}
                    </span>
                    {canWriteNotes && <ConfirmButton
                      action={doDeleteNote}
                      label="삭제"
                      confirmMessage="이 노트를 삭제하시겠습니까?"
                      confirmLabel="삭제"
                      labelClassName="text-label-small text-error hover:underline"
                      confirmClassName="text-label-small text-error hover:underline"
                    />}
                  </div>
                  <p className="text-body-small whitespace-pre-wrap">{note.body}</p>
                </div>
              );
            })}
          </div>
        )}

        {canWriteNotes && <ActionForm action={saveNote} className="space-y-2">
          <textarea
            name="body"
            rows={3}
            required
            placeholder="메모를 입력하세요"
            className="w-full rounded border border-outline px-3 py-2 text-body-small bg-surface resize-none focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <SubmitButton className="rounded border border-outline px-4 py-2 text-label-large text-on-surface hover:bg-surface-container-low">
            저장
          </SubmitButton>
        </ActionForm>}
      </section>
    </>
  );
}
