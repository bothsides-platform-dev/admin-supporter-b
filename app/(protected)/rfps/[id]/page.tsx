import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getRfpDetail } from '@/lib/server/queries/admin/rfps';
import { AdminStatusBadge } from '@/components/AdminStatusBadge';
import { BidFeeMatrix } from '@/components/BidFeeMatrix';
import { extendRfpDeadlineAction } from '@/lib/server/actions/admin/extendRfpDeadlineAction';
import { formatKST, formatDateKST, formatKRW, isSafeHttpUrl } from '@/lib/utils';
import { hideQuoteAction } from '@/lib/server/actions/admin/hideQuoteAction';
import { sendReminderAction } from '@/lib/server/actions/admin/sendReminderAction';
import { paymentMethodLabel, merchantTierLabel } from '@/lib/types/bid';
import { CONTRACT_TYPE_LABELS, STRIP_PATH_FEE_RATE, solutionLabel } from '@/lib/types/rfp-terms';
import { taxTypeLabel, gradeSourceLabel } from '@/lib/types/biz-profile';
import { Chip } from '@/components/primitives/Chip';

function DetailRow({ label, value, badge }: { label: string; value: React.ReactNode; badge?: React.ReactNode }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div>
      <span className="text-on-surface-variant">{label}</span>
      <span className="ml-3">{value}</span>
      {badge}
    </div>
  );
}

function AttachmentList({ attachments }: { attachments: { id: string; name: string; size: number; uploadedAt: Date }[] }) {
  return (
    <ul className="list-disc list-inside space-y-0.5">
      {attachments.map((a) => (
        <li key={a.id}>
          {a.name}{' '}
          <span className="text-label-small text-on-surface-variant md-numeric">
            ({Math.ceil(a.size / 1024)}KB · {formatDateKST(a.uploadedAt)})
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

export default async function RfpDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detail = await getRfpDetail(id);
  if (!detail) notFound();

  const {
    rfp,
    buyerName,
    createdByName,
    createdByEmail,
    bizProfile,
    currentTerms,
    customPaymentMethods,
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

  async function extendAction(formData: FormData) {
    'use server';
    const days = Number(formData.get('days') ?? 7);
    await extendRfpDeadlineAction(undefined, rfp.id, days);
  }

  async function reminderAction() {
    'use server';
    const allPgWsIds = bids.map((b) => b.pgWsId);
    await sendReminderAction(undefined, rfp.id, allPgWsIds);
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <Link
          href="/rfps"
          className="text-on-surface-variant hover:text-on-surface text-body-small"
        >
          ← 목록
        </Link>
        <h1 className="text-headline-small font-semibold">{rfp.title}</h1>
        <AdminStatusBadge status={rfp.status} />
      </div>

      {/* RFP info */}
      <section className="rounded border border-outline-variant">
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
          <DetailRow label="마감" value={<span className="md-numeric">{formatKST(rfp.deadline)}</span>} />
          {rfp.sentAt && (
            <DetailRow label="발송일" value={<span className="md-numeric">{formatKST(rfp.sentAt)}</span>} />
          )}
          <DetailRow label="생성일" value={<span className="md-numeric">{formatKST(rfp.createdAt)}</span>} />
          <DetailRow label="게시판 노출" value={rfp.boardVisible ? '노출' : '비노출'} />
          {rfp.websiteUrl && (
            <DetailRow
              label="사이트"
              value={
                isSafeHttpUrl(rfp.websiteUrl) ? (
                  <a href={rfp.websiteUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline break-all">
                    {rfp.websiteUrl}
                  </a>
                ) : (
                  <span className="break-all">{rfp.websiteUrl}</span>
                )
              }
            />
          )}
          {rfp.mainProducts && <DetailRow label="주요 상품" value={rfp.mainProducts} />}
          {bizProfile?.bizNo && <DetailRow label="사업자번호" value={<span className="md-numeric">{bizProfile.bizNo}</span>} />}
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
      <section className="rounded border border-outline-variant">
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
            <DetailRow label="보증보험" value={currentTerms.guaranteeInsurance} />
            <DetailRow label="정산주기" value={currentTerms.settlementCycle} />
            <DetailRow label="배송·서비스 주기" value={currentTerms.deliveryServicePeriod} />
            <DetailRow
              label="솔루션"
              value={
                currentTerms.solution
                  ? `${solutionLabel(currentTerms.solution)}${currentTerms.solutionDetail ? ` (${currentTerms.solutionDetail})` : ''}`
                  : undefined
              }
            />
            <DetailRow label="연 PG 거래량" value={currentTerms.annualPgVolume} />
          </div>
        ) : (
          <p className="px-4 py-8 text-center text-on-surface-variant text-body-small">
            제출된 현재 조건 없음
          </p>
        )}
      </section>

      {/* Requested payment methods */}
      <section className="rounded border border-outline-variant">
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
      <section className="rounded border border-outline-variant">
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
      <section className="rounded border border-outline-variant">
        <div className="border-b border-outline-variant px-4 py-2 bg-surface-container-low">
          <h2 className="text-title-small font-medium">마감 연장</h2>
        </div>
        <form action={extendAction} className="px-4 py-3 flex items-center gap-3">
          <label className="text-body-small text-on-surface-variant">연장 일수</label>
          <input
            name="days"
            type="number"
            min={1}
            max={30}
            defaultValue={7}
            className="w-20 rounded border border-outline px-2 py-1 text-body-small bg-surface md-numeric focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <span className="text-body-small text-on-surface-variant">일</span>
          <button
            type="submit"
            className="rounded bg-primary px-4 py-1.5 text-label-medium text-on-primary hover:bg-primary/90"
          >
            연장
          </button>
        </form>
      </section>

      {/* Bid list */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-title-small font-semibold">견적 목록 ({bids.length}건)</h2>
          {bids.length > 0 && (
            <form action={reminderAction}>
              <button
                type="submit"
                className="rounded border border-outline px-3 py-1.5 text-label-small text-on-surface hover:bg-surface-container-low"
              >
                전체 리마인더 발송
              </button>
            </form>
          )}
        </div>
        <div className="rounded border border-outline-variant overflow-x-auto">
          <table className="w-full text-body-small">
            <thead>
              <tr className="border-b border-outline-variant bg-surface-container-low">
                <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium">PG사</th>
                <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium">차수</th>
                <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium">상태</th>
                <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium">정산주기</th>
                <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium">정산한도</th>
                <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium">보증보험</th>
                <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium">제출자</th>
                <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium">제출일</th>
                <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium">처리</th>
              </tr>
            </thead>
            <tbody>
              {bids.map((bid) => {
                const isAwarded = rfp.awardedBidId === bid.id;

                async function hideBidAction(formData: FormData) {
                  'use server';
                  const reason = String(formData.get('reason') ?? '').trim();
                  await hideQuoteAction(undefined, bid.id, reason);
                }

                return (
                  <tr
                    key={bid.id}
                    className={`border-b border-outline-variant last:border-0 hover:bg-surface-container-low ${isAwarded ? 'bg-tertiary-container/30' : ''}`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {bid.pgWsName}
                        {isAwarded && <Chip color="tertiary" label="낙찰" />}
                      </div>
                    </td>
                    <td className="px-4 py-3 md-numeric text-label-small text-on-surface-variant">{bid.round}</td>
                    <td className="px-4 py-3">
                      <AdminStatusBadge status={bid.status} />
                    </td>
                    <td className="px-4 py-3 md-numeric text-label-small">{bid.settleCycle}</td>
                    <td className="px-4 py-3 md-numeric text-label-small">{formatKRW(bid.settleLimit)}</td>
                    <td className="px-4 py-3 md-numeric text-label-small">{formatKRW(bid.guaranteeInsurance)}</td>
                    <td className="px-4 py-3 text-label-small text-on-surface-variant">{bid.submittedByName ?? '—'}</td>
                    <td className="px-4 py-3 md-numeric text-label-small text-on-surface-variant">
                      {formatDateKST(bid.submittedAt)}
                    </td>
                    <td className="px-4 py-3">
                      {bid.status === 'submitted' && (
                        <form action={hideBidAction} className="flex items-center gap-2">
                          <input
                            name="reason"
                            type="text"
                            required
                            placeholder="철회 사유"
                            className="rounded border border-outline px-2 py-1 text-body-small bg-surface focus:outline-none focus:ring-1 focus:ring-primary w-40"
                          />
                          <button
                            type="submit"
                            className="rounded border border-error px-2 py-1 text-label-small text-error hover:bg-error-container"
                          >
                            철회
                          </button>
                        </form>
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
        <section>
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
        <section className="rounded border border-outline-variant">
          <div className="border-b border-outline-variant px-4 py-2 bg-surface-container-low">
            <h2 className="text-title-small font-medium">견적별 메모</h2>
          </div>
          <div className="divide-y divide-outline-variant">
            {bids
              .filter((b) => b.memo)
              .map((b) => (
                <div key={b.id} className="px-4 py-3 text-body-small space-y-1">
                  <p className="text-label-small text-on-surface-variant">
                    {b.pgWsName} · {b.round}차
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
            <h2 className="text-title-small font-medium">제안서 첨부 ({proposalAttachments.length}건)</h2>
          </div>
          <div className="px-4 py-3 text-body-small">
            <AttachmentList attachments={proposalAttachments} />
          </div>
        </section>
      )}

      {/* Award / contract */}
      <section className="rounded border border-outline-variant">
        <div className="border-b border-outline-variant px-4 py-2 bg-surface-container-low">
          <h2 className="text-title-small font-medium">낙찰/계약</h2>
        </div>
        {contract && contractBid ? (
          <div className="px-4 py-3 grid grid-cols-2 gap-3 text-body-small">
            <DetailRow label="낙찰 PG" value={contractBid.pgWsName} />
            <DetailRow label="낙찰일시" value={<span className="md-numeric">{formatKST(contract.awardedAt)}</span>} />
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
    </div>
  );
}
