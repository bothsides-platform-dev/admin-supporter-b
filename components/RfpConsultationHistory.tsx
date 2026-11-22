import Link from 'next/link';
import { REVIEW_LABELS, SIGNING_LABELS } from '@/lib/rfp-board';
import { actionDb } from '@/lib/server/actions/auth/_shared';
import { requestCases } from '@/lib/server/consultations/queries';
import type { getRfpHistory } from '@/lib/server/queries/admin/rfpBoard';
import { formatKST } from '@/lib/utils';
import { ConsultationHistory } from './ConsultationHistory';

export async function RfpConsultationHistory({
  reviews,
  signings,
  rfpId,
  canManage,
}: Awaited<ReturnType<typeof getRfpHistory>> & { rfpId: string; canManage: boolean }) {
  const cases = reviews.length ? await requestCases(actionDb(), rfpId) : [];
  const casesByReview = new Map(cases.map((c) => [c.review_id, c]));
  return (
    <section
      id="consultations"
      className="scroll-mt-4 space-y-3 rounded border border-outline-variant p-4 text-body-small"
    >
      <h2 className="text-title-small font-semibold">PG 상담 및 서명 이력</h2>
      <h3 className="font-medium">맞춤 상담 회차</h3>
      {reviews.length ? (
        <ol className="divide-y divide-outline-variant">
          {reviews.map((review, index) => {
            const consultationCase = casesByReview.get(review.id);
            return (
              <li key={review.id} className="space-y-1 py-2">
                <strong>
                  {reviews.length - index}차 ·{' '}
                  <Link className="underline" href={`/consultations/${review.pgId}`}>
                    {review.pg}
                  </Link>
                </strong>{' '}
                · {REVIEW_LABELS[review.status]}
                <p>
                  요청 {formatKST(review.createdAt)} · 최근 변경 {formatKST(review.updatedAt)}
                </p>
                {review.reason && <p className="whitespace-pre-wrap">사유 · {review.reason}</p>}
                {consultationCase ? (
                  <ConsultationHistory c={consultationCase} canManage={canManage} />
                ) : (
                  <p className="text-on-surface-variant">
                    PG 상담 담당자 · 기록 없음
                    <br />
                    PG 첫 연락 시각 · 기록 없음
                  </p>
                )}
              </li>
            );
          })}
        </ol>
      ) : (
        <p>맞춤 상담 기록 없음</p>
      )}
      <h3 className="font-medium">전자계약</h3>
      {signings.length ? (
        <ol className="divide-y divide-outline-variant">
          {signings.map((s) => (
            <li key={s.id} className="space-y-1 py-2">
              <strong>{s.kind === 'platform_buyer' ? '노온–구매사 합의서' : '과거 PG–구매사 계약'}</strong> ·{' '}
              {s.round}차 · {SIGNING_LABELS[s.status]}
              <p>마지막 확인 {formatKST(s.observedAt)}</p>
              <Link href={`/tasks?rfp=${rfpId}&target=signing:${s.id}`} className="text-primary">
                이 계약의 후속 업무
              </Link>
              {s.reason && <p className="whitespace-pre-wrap">사유 · {s.reason}</p>}
            </li>
          ))}
        </ol>
      ) : (
        <p>전자계약 기록 없음</p>
      )}
    </section>
  );
}
