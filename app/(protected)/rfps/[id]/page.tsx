import { bidConditions, formatCondition } from '@/lib/quote/terms';
import { cache } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AdminPageHeader } from '@/components/AdminPageHeader';
import { CopyableValue } from '@/components/CopyableValue';
import { AdminSectionNav } from '@/components/AdminSectionNav';
import Link from 'next/link';
import { getRfpDetail } from '@/lib/server/queries/admin/rfps';
import { AdminStatusBadge } from '@/components/AdminStatusBadge';
import { BidFeeMatrix } from '@/components/BidFeeMatrix';
import { RfpPgResponseTable } from '@/components/RfpPgResponseTable';
import { RfpConsultationHistory } from '@/components/RfpConsultationHistory';
import { getRfpHistory } from '@/lib/server/queries/admin/rfpBoard';
import { extendRfpDeadlineAction } from '@/lib/server/actions/admin/extendRfpDeadlineAction';
import { ExtendDeadlineForm } from '@/components/ExtendDeadlineForm';
import { ActionForm } from '@/components/ActionForm';
import { SubmitButton } from '@/components/SubmitButton';
import { actionFailure, actionSuccess, toActionState, type ActionState } from '@/lib/action-state';
import { formatKST, formatDateKST, formatKRW, isSafeHttpUrl, isUuid } from '@/lib/utils';
import { hideQuoteAction } from '@/lib/server/actions/admin/hideQuoteAction';
import { paymentMethodLabel, merchantTierLabel } from '@/lib/types/bid';
import { CONTRACT_TYPE_LABELS, STRIP_PATH_FEE_RATE, solutionLabel } from '@/lib/types/rfp-terms';
import { taxTypeLabel, gradeSourceLabel } from '@/lib/types/biz-profile';
import { Chip } from '@/components/primitives/Chip';
import { requireAdminPermission } from '@/lib/auth/admin-session';
import { hasPermission } from '@/lib/auth/permissions';
import { listEntityAuditLogs } from '@/lib/server/queries/admin/audit-log';
import { AdminAuditHistory } from '@/components/AdminAuditHistory';
import { listReturnLabel, safeListReturnTo } from '@/lib/admin-return-to';

import { deleteRfpAction } from '@/lib/server/actions/admin/deleteRfpAction';
import { getRfpDeletionImpact } from '@/lib/server/queries/admin/deletion-impact';
import { DangerousDeleteForm } from '@/components/DangerousDeleteForm';

function DetailRow({
  label,
  value,
  badge,
}: {
  label: string;
  value: React.ReactNode;
  badge?: React.ReactNode;
}) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div>
      <span className="text-on-surface-variant">{label}</span>
      <span className="ml-3">{value}</span>
      {badge}
    </div>
  );
}

function AttachmentList({
  attachments,
}: {
  attachments: { id: string; name: string; size: number; uploadedAt: Date }[];
}) {
  return (
    <ul className="list-disc list-inside space-y-0.5">
      {attachments.map((a) => (
        <li key={a.id}>
          {a.name}{' '}
          <span className="text-label-small text-on-surface-variant md-numeric">
            ({Math.ceil(a.size / 1024)}KB, {formatDateKST(a.uploadedAt)})
          </span>
        </li>
      ))}
    </ul>
  );
}

function PgHiddenBadge() {
  return (
    <span className="ml-2 align-middle">
      <Chip color="surface" label="PG 비공개" />
    </span>
  );
}

// generateMetadata 와 본문이 같은 조회를 한 번만 하도록 요청 단위로 캐시한다.
const loadRfp = cache(async (id: string) => {
  await requireAdminPermission('data.view');
  return isUuid(id) ? getRfpDetail(id) : null;
});

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const detail = await loadRfp((await params).id);
  return { title: detail ? detail.rfp.title : 'RFP' };
}

export default async function RfpDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const { id } = await params;
  const returnTo = safeListReturnTo((await searchParams).returnTo, '/rfps');
  const fromPgStatus = returnTo.startsWith('/pg-status');
  const session = await requireAdminPermission('data.view');
  if (!isUuid(id)) notFound();
  const [detail, history, consultation] = await Promise.all([
    loadRfp(id),
    listEntityAuditLogs('rfp', id),
    getRfpHistory(id),
  ]);
  if (!detail) notFound();
  const canManage = hasPermission(session, 'rfp.manage');
  const canDelete = hasPermission(session, 'rfp.delete');
  const deletionImpact = canDelete ? await getRfpDeletionImpact(id) : [];

  const {
    rfp,
    buyerName,
    createdByName,
    createdByEmail,
    bizProfile,
    currentTerms,
    customPaymentMethods,
    pgResponses,
    bids,
    contract,
    attachments,
    proposalAttachments,
  } = detail;

  const hiddenFromPg = new Set(rfp.hiddenFromPg);
  const feeRateHidden = hiddenFromPg.has(STRIP_PATH_FEE_RATE);

  const hasCurrentTerms = Object.entries(currentTerms).some(
    ([k, v]) => k !== '_v' && v !== undefined && v !== null && v !== '',
  );

  // 계약 섹션은 contracts.bidId(권위 있는 링크)로 조회 — rfp.awardedBidId 는
  // CHECK 상 계약 없이도 null 이 아닐 수 있는 반대 방향만 강제하므로 여기선 안 쓴다.
  // (낙찰 칩은 아래 견적 목록에서 rfp.awardedBidId 를 직접 비교한다.)
  const contractBid = contract ? bids.find((b) => b.id === contract.bidId) : undefined;

  async function extendAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
    'use server';
    const days = Number(formData.get('days') ?? 7);
    const result = await extendRfpDeadlineAction(undefined, rfp.id, days);
    return result.ok
      ? actionSuccess(`마감이 ${days}일 연장되었습니다. 새 마감: ${formatKST(result.newDeadline)}`)
      : actionFailure(result.error);
  }

  async function doDelete(_previous: ActionState, formData: FormData): Promise<ActionState> {
    'use server';
    return deleteRfpAction(rfp.id, String(formData.get('confirmationName') ?? ''), returnTo);
  }

  // 조건부로 그리는 섹션은 목차에서도 같은 조건으로 뺀다.
  const sections = [
    { id: 'info', label: 'RFP 정보' },
    { id: 'current-terms', label: '현재 조건' },
    { id: 'payment-methods', label: '요청 결제수단' },
    { id: 'memo', label: '메모·첨부' },
    { id: 'pg-responses', label: 'PG사별 응답 현황' },
    { id: 'consultations', label: 'PG 상담 및 서명 이력' },
    { id: 'bids', label: '견적 목록' },
    ...(bids.length > 0 ? [{ id: 'fee-matrix', label: '수수료 비교표' }] : []),
    ...(bids.some((b) => b.memo) ? [{ id: 'bid-memos', label: '견적별 메모' }] : []),
    { id: 'contract', label: '낙찰/계약' },
    { id: 'history', label: '변경 이력' },
  ];

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title={rfp.title}
        breadcrumbs={[{ label: listReturnLabel(returnTo, 'RFP'), href: returnTo }]}
        badges={<AdminStatusBadge status={rfp.status} />}
        meta={<>
          <span>코드 <CopyableValue value={rfp.code} label="RFP 코드" numeric /></span>
          <span>RFP ID <CopyableValue value={rfp.id} label="RFP ID" numeric /></span>
        </>}
      >
        <Link className="text-body-small text-primary" href={`/tasks?rfp=${rfp.id}`}>이 RFP의 후속 업무</Link>
        <Link className="text-body-small text-primary" href={`/rfps/${rfp.id}/reminders`}>견적 마감 안내</Link>
      </AdminPageHeader>
      <AdminSectionNav items={sections} className="lg:hidden" />

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_10rem] lg:items-start lg:gap-6">
      <div className="min-w-0 space-y-6">

      {/* RFP info */}
      <section id="info" className="scroll-mt-4 rounded border border-outline-variant">
        <div className="border-b border-outline-variant px-4 py-2 bg-surface-container-low">
          <h2 className="text-title-small font-medium">RFP 정보</h2>
        </div>
        <div className="px-4 py-3 grid grid-cols-2 gap-3 text-body-small">
          <DetailRow label="코드" value={<span className="md-numeric">{rfp.code}</span>} />
          <DetailRow label="상태" value={<AdminStatusBadge status={rfp.status} />} />
          <DetailRow
            label="구매사"
            value={
              <Link href={`/buyers/${rfp.buyerWsId}`} className="text-primary hover:underline">
                {buyerName}
              </Link>
            }
          />
          <DetailRow label="작성자" value={`${createdByName} (${createdByEmail})`} />
          {rfp.contractType && (
            <DetailRow label="계약유형" value={CONTRACT_TYPE_LABELS[rfp.contractType]} />
          )}
          <DetailRow
            label="마감"
            value={<span className="md-numeric">{formatKST(rfp.deadline)}</span>}
          />
          {rfp.sentAt && (
            <DetailRow
              label="발송일"
              value={<span className="md-numeric">{formatKST(rfp.sentAt)}</span>}
            />
          )}
          <DetailRow
            label="생성일"
            value={<span className="md-numeric">{formatKST(rfp.createdAt)}</span>}
          />
          <DetailRow label="게시판 노출" value={rfp.boardVisible ? '노출' : '비노출'} />
          {rfp.websiteUrl && (
            <DetailRow
              label="사이트"
              value={
                isSafeHttpUrl(rfp.websiteUrl) ? (
                  <a
                    href={rfp.websiteUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary hover:underline break-all"
                  >
                    {rfp.websiteUrl}
                  </a>
                ) : (
                  <span className="break-all">{rfp.websiteUrl}</span>
                )
              }
            />
          )}
          {rfp.mainProducts && <DetailRow label="주요 상품" value={rfp.mainProducts} />}
          {bizProfile?.bizNo && (
            <DetailRow
              label="사업자번호"
              value={<span className="md-numeric">{bizProfile.bizNo}</span>}
            />
          )}
          {bizProfile?.taxType && (
            <DetailRow label="과세유형" value={taxTypeLabel(bizProfile.taxType)} />
          )}
          {bizProfile?.grade && (
            <DetailRow
              label="영중소구간"
              value={merchantTierLabel(bizProfile.grade)}
              badge={
                bizProfile.gradeSource && (
                  <span className="ml-2 text-label-small text-on-surface-variant">
                    ({gradeSourceLabel(bizProfile.gradeSource)})
                  </span>
                )
              }
            />
          )}
        </div>
      </section>

      {/* Current terms (buyer-submitted) */}
      <section id="current-terms" className="scroll-mt-4 rounded border border-outline-variant">
        <div className="border-b border-outline-variant px-4 py-2 bg-surface-container-low">
          <h2 className="text-title-small font-medium">현재 조건 (구매사 제출)</h2>
        </div>
        {hasCurrentTerms ? (
          <div className="px-4 py-3 grid grid-cols-2 gap-3 text-body-small">
            <DetailRow
              label="수수료율"
              value={currentTerms.feeRate}
              badge={feeRateHidden && <PgHiddenBadge />}
            />
            <DetailRow label="정산한도" value={currentTerms.settlementLimit} />
            <DetailRow label="보증보험 금액(원)" value={currentTerms.guaranteeInsurance} />
            <DetailRow label="정산주기" value={currentTerms.settlementCycle} />
            <DetailRow label="배송 또는 서비스 주기" value={currentTerms.deliveryServicePeriod} />
            <DetailRow
              label="솔루션"
              value={
                currentTerms.solution
                  ? `${solutionLabel(currentTerms.solution)}${currentTerms.solutionDetail ? ` (${currentTerms.solutionDetail})` : ''}`
                  : undefined
              }
            />
            <DetailRow label="전년도 월 평균 PG 거래액" value={currentTerms.monthlyAvgPgVolume} />
          </div>
        ) : (
          <p className="px-4 py-8 text-center text-on-surface-variant text-body-small">
            제출된 현재 조건 없음
          </p>
        )}
      </section>

      {/* Requested payment methods */}
      <section id="payment-methods" className="scroll-mt-4 rounded border border-outline-variant">
        <div className="border-b border-outline-variant px-4 py-2 bg-surface-container-low">
          <h2 className="text-title-small font-medium">요청 결제수단</h2>
        </div>
        <div className="px-4 py-3 flex flex-wrap gap-2">
          {rfp.requiredPaymentMethods.length === 0 && customPaymentMethods.length === 0 ? (
            <span className="text-body-small text-on-surface-variant">제한 없음</span>
          ) : (
            <>
              {rfp.requiredPaymentMethods.map((m) => (
                <Chip key={m} color="surface" label={paymentMethodLabel(m)} />
              ))}
              {customPaymentMethods.map((c) => (
                <Chip key={c.id} color="surface" label={c.label} />
              ))}
            </>
          )}
        </div>
      </section>

      {/* Memo / attachments */}
      <section id="memo" className="scroll-mt-4 rounded border border-outline-variant">
        <div className="border-b border-outline-variant px-4 py-2 bg-surface-container-low">
          <h2 className="text-title-small font-medium">RFP 메모 / 첨부파일</h2>
        </div>
        <div className="px-4 py-3 space-y-3 text-body-small">
          <p className="whitespace-pre-wrap">{rfp.memo || '메모 없음'}</p>
          {attachments.length > 0 ? (
            <div className="space-y-1">
              <p className="text-label-small text-on-surface-variant">
                첨부파일 {attachments.length}건 (다운로드는 admin에서 지원하지 않음)
              </p>
              <AttachmentList attachments={attachments} />
            </div>
          ) : (
            <p className="text-label-small text-on-surface-variant">첨부파일 없음</p>
          )}
        </div>
      </section>

      {/* Extend deadline */}
      {canManage && <ExtendDeadlineForm action={extendAction} />}

      <RfpPgResponseTable rows={pgResponses} overviewHref={fromPgStatus ? returnTo : undefined} />
      <RfpConsultationHistory {...consultation} rfpId={rfp.id} />

      {/* Bid list */}
      <section id="bids" className="scroll-mt-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-title-small font-semibold">견적 목록 ({bids.length}건)</h2>
        </div>
        <div className="rounded border border-outline-variant overflow-x-auto">
          <table className="min-w-full text-body-small">
            <thead>
              <tr className="border-b border-outline-variant bg-surface-container-low">
                <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium whitespace-nowrap">
                  PG사
                </th>
                <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium whitespace-nowrap">
                  차수
                </th>
                <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium whitespace-nowrap">
                  상태
                </th>
                <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium whitespace-nowrap">
                  정산주기
                </th>
                <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium whitespace-nowrap">
                  정산한도
                </th>
                <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium whitespace-nowrap">
                  보증보험 금액(원)
                </th>
                <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium whitespace-nowrap">
                  제출자
                </th>
                <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium whitespace-nowrap">
                  제출일
                </th>
                <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium whitespace-nowrap">
                  처리
                </th>
              </tr>
            </thead>
            <tbody>
              {bids.map((bid) => {
                const isAwarded = rfp.awardedBidId === bid.id;

                async function hideBidAction(
                  _prev: ActionState,
                  formData: FormData,
                ): Promise<ActionState> {
                  'use server';
                  const reason = String(formData.get('reason') ?? '').trim();
                  return toActionState(
                    await hideQuoteAction(undefined, bid.id, reason),
                    '견적을 철회했습니다.',
                  );
                }

                return (
                  <tr
                    key={bid.id}
                    className={`border-b border-outline-variant last:border-0 hover:bg-surface-container-low ${isAwarded ? 'bg-tertiary-container/30' : ''}`}
                  >
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        {bid.pgWsName}
                        {isAwarded && <Chip color="tertiary" label="낙찰" />}
                      </div>
                    </td>
                    <td className="px-4 py-3 md-numeric text-label-small text-on-surface-variant whitespace-nowrap">
                      {bid.round}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <AdminStatusBadge status={bid.status} />
                    </td>
                    <td className="px-4 py-3 md-numeric text-label-small whitespace-nowrap">
                      {bid.settleCycle}
                    </td>
                    <td className="px-4 py-3 md-numeric text-label-small whitespace-nowrap">
                      {formatKRW(bid.settleLimit)}
                    </td>
                    <td className="px-4 py-3 md-numeric text-label-small whitespace-nowrap">
                      {formatCondition(bidConditions(bid).guaranteeInsurance)}
                      <div className="mt-1 text-on-surface-variant">
                        가입비 · {formatCondition(bidConditions(bid).signupFee)} (최초 1회)
                      </div>
                    </td>
                    <td className="px-4 py-3 text-label-small text-on-surface-variant whitespace-nowrap">
                      {bid.submittedByName ?? '—'}
                    </td>
                    <td className="px-4 py-3 md-numeric text-label-small text-on-surface-variant whitespace-nowrap">
                      {formatDateKST(bid.submittedAt)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {bid.status !== 'draft' && <Link className="text-primary" href={`/tasks?rfp=${rfp.id}&target=bid:${bid.id}`}>조건 확인 업무</Link>}
                      {canManage && bid.status === 'submitted' && (
                        <ActionForm action={hideBidAction} className="flex items-center gap-2">
                          <input
                            name="reason"
                            type="text"
                            required
                            placeholder="철회 사유"
                            className="rounded border border-outline px-2 py-1 text-body-small bg-surface focus:outline-none focus:ring-1 focus:ring-primary w-40"
                          />
                          <SubmitButton className="rounded border border-error px-2 py-1 text-label-small text-error hover:bg-error-container">
                            철회
                          </SubmitButton>
                        </ActionForm>
                      )}
                    </td>
                  </tr>
                );
              })}
              {bids.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-on-surface-variant">
                    견적이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Fee comparison matrix */}
      {bids.length > 0 && (
        <section id="fee-matrix" className="scroll-mt-4">
          <h2 className="text-title-small font-semibold mb-3">수수료 비교표</h2>
          <BidFeeMatrix
            bids={bids}
            requiredPaymentMethods={rfp.requiredPaymentMethods}
            customPaymentMethods={customPaymentMethods}
          />
        </section>
      )}

      {/* Per-bid memos */}
      {bids.some((b) => b.memo) && (
        <section id="bid-memos" className="scroll-mt-4 rounded border border-outline-variant">
          <div className="border-b border-outline-variant px-4 py-2 bg-surface-container-low">
            <h2 className="text-title-small font-medium">견적별 메모</h2>
          </div>
          <div className="divide-y divide-outline-variant">
            {bids
              .filter((b) => b.memo)
              .map((b) => (
                <div key={b.id} className="px-4 py-3 text-body-small space-y-1">
                  <p className="text-label-small text-on-surface-variant">
                    {b.pgWsName}, {b.round}차
                  </p>
                  <p className="whitespace-pre-wrap">{b.memo}</p>
                </div>
              ))}
          </div>
        </section>
      )}

      {proposalAttachments.length > 0 && (
        <section className="rounded border border-outline-variant">
          <div className="border-b border-outline-variant px-4 py-2 bg-surface-container-low">
            <h2 className="text-title-small font-medium">
              제안서 첨부 ({proposalAttachments.length}건)
            </h2>
          </div>
          <div className="px-4 py-3 text-body-small">
            <AttachmentList attachments={proposalAttachments} />
          </div>
        </section>
      )}

      {/* Award / contract */}
      <section id="contract" className="scroll-mt-4 rounded border border-outline-variant">
        <div className="border-b border-outline-variant px-4 py-2 bg-surface-container-low">
          <h2 className="text-title-small font-medium">낙찰/계약</h2>
        </div>
        {contract && contractBid ? (
          <div className="px-4 py-3 grid grid-cols-2 gap-3 text-body-small">
            <DetailRow label="낙찰 PG" value={contractBid.pgWsName} />
            <DetailRow
              label="낙찰일시"
              value={<span className="md-numeric">{formatKST(contract.awardedAt)}</span>}
            />
            <DetailRow label="처리자" value={contract.awardedByName ?? '—'} />
          </div>
        ) : contract ? (
          // contract 는 있는데 그 bidId 가 이 RFP 의 bids 목록에 없는 경우 —
          // "미낙찰"/"계약 정보 없음"으로 표시하면 실제로 계약이 있는데
          // 없다고 거짓 확언하는 셈이라 별도 불일치 상태로 보여준다.
          <p className="px-4 py-8 text-center text-error text-body-small">
            데이터 불일치: 계약은 존재하나 연결된 견적을 찾을 수 없습니다 (bid: {contract.bidId})
          </p>
        ) : (
          <p className="px-4 py-8 text-center text-on-surface-variant text-body-small">
            {rfp.status === 'awarded' ? '계약 정보 없음' : '미낙찰'}
          </p>
        )}
      </section>
      <div id="history" className="scroll-mt-4">
        <AdminAuditHistory logs={history} entityType="rfp" entityId={rfp.id} />
      </div>
      {canDelete && (
        <DangerousDeleteForm
          name={rfp.title}
          label="RFP"
          impact={deletionImpact}
          action={doDelete}
        />
      )}
      </div>
      <AdminSectionNav items={sections} orientation="vertical" className="sticky top-0 hidden lg:block" />
      </div>
    </div>
  );
}
