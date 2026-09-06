import {
  MERCHANT_TIERS,
  isFlatFeeMethod,
  merchantTierLabel,
  paymentMethodLabel,
  type CustomFeesDisplay,
  type CustomPaymentMethod,
  type PaymentFeesDisplay,
  type TierRates,
} from '@/lib/types/bid';
import { AdminStatusBadge } from '@/components/AdminStatusBadge';
import { formatKRW, formatPct } from '@/lib/utils';

export type FeeMatrixBid = {
  id: string;
  pgWsName: string;
  round: number;
  status: string;
  paymentFees: PaymentFeesDisplay;
  customFees: CustomFeesDisplay;
};

type BidFeeMatrixProps = {
  bids: FeeMatrixBid[];
  requiredPaymentMethods: string[];
  customPaymentMethods: CustomPaymentMethod[];
};

function isTierRates(value: number | TierRates | undefined): value is TierRates {
  return typeof value === 'object' && value !== null;
}

/** 결제수단 하나·견적 하나의 셀 내용. bidit buildSubmittedSummaryRows 와 동일 규칙. */
function FeeCell({ method, fee }: { method: string; fee: number | TierRates | undefined }) {
  if (fee === undefined) {
    return <span className="text-on-surface-variant">—</span>;
  }
  if (isTierRates(fee)) {
    const defined = MERCHANT_TIERS.filter((t) => fee[t] !== undefined);
    if (defined.length === 0) return <span className="text-on-surface-variant">—</span>;
    return (
      <div className="flex flex-col gap-0.5">
        {defined.map((t) => (
          <div key={t}>
            <span className="text-on-surface-variant">{merchantTierLabel(t)}</span>{' '}
            {formatPct(fee[t]!)}
          </div>
        ))}
      </div>
    );
  }
  if (isFlatFeeMethod(method)) {
    return <span>{formatKRW(fee)} (건당)</span>;
  }
  return <span>{formatPct(fee)}</span>;
}

/**
 * 견적(bids) 간 결제수단별 수수료 비교표. 열 키는 pgWsId 가 아니라 bid.id —
 * bids_rfp_pg_round_unique(rfp_id, pg_ws_id, round) 로 같은 PG가 재견적(round≥2)
 * 시 여러 견적을 가질 수 있어 PG로 열을 잡으면 충돌한다.
 */
export function BidFeeMatrix({ bids, requiredPaymentMethods, customPaymentMethods }: BidFeeMatrixProps) {
  if (bids.length === 0) return null;

  // 행 순서: RFP 요청 수단 우선, 그 외 어떤 견적이든 실제 제출한 수단은 뒤에 추가.
  const seen = new Set<string>(requiredPaymentMethods);
  const extraMethods: string[] = [];
  for (const m of bids.flatMap((b) => Object.keys(b.paymentFees))) {
    if (seen.has(m)) continue;
    seen.add(m);
    extraMethods.push(m);
  }
  const methodRows = [...requiredPaymentMethods, ...extraMethods];

  const customIds = new Set<string>();
  bids.forEach((b) => Object.keys(b.customFees).forEach((id) => customIds.add(id)));

  return (
    <div className="rounded border border-outline-variant overflow-x-auto">
      <table className="w-full text-body-small">
        <thead>
          <tr className="border-b border-outline-variant bg-surface-container-low">
            <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium sticky left-0 bg-surface-container-low">
              결제수단
            </th>
            {bids.map((b) => (
              <th key={b.id} className="px-4 py-2 text-left text-label-small font-medium whitespace-nowrap">
                <div className="flex items-center gap-2">
                  <span className="text-on-surface">
                    {b.pgWsName} · {b.round}차
                  </span>
                  <AdminStatusBadge status={b.status} />
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {methodRows.map((method) => (
            <tr key={method} className="border-b border-outline-variant last:border-0">
              <td className="px-4 py-3 text-on-surface-variant sticky left-0 bg-surface">
                {paymentMethodLabel(method)}
              </td>
              {bids.map((b) => (
                <td key={b.id} className="px-4 py-3">
                  <FeeCell method={method} fee={b.paymentFees[method] as number | TierRates | undefined} />
                </td>
              ))}
            </tr>
          ))}
          {[...customIds].map((id) => {
            const label = customPaymentMethods.find((c) => c.id === id)?.label ?? id;
            return (
              <tr key={id} className="border-b border-outline-variant last:border-0">
                <td className="px-4 py-3 text-on-surface-variant sticky left-0 bg-surface">{label}</td>
                {bids.map((b) => (
                  <td key={b.id} className="px-4 py-3">
                    {b.customFees[id] !== undefined ? (
                      formatPct(b.customFees[id])
                    ) : (
                      <span className="text-on-surface-variant">—</span>
                    )}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
