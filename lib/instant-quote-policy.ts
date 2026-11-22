import { z } from 'zod';
import {
  AgreementRatesSchema,
  parseAgreementRateForm,
  type AgreementRate,
} from './agreement-rates';
import { MERCHANT_TIERS, PAYMENT_METHODS, isTieredMethod } from './types/bid';
export const priceOptions = [
  'under_100k',
  '100k_300k',
  '300k_500k',
  '500k_1m',
  '1m_2m',
  '2m_5m',
  '5m_10m',
  '10m_20m',
  'over_20m',
] as const;
export const saleOptions = [
  'preorder',
  'used',
  'group_buying',
  'cross_border',
  'subscription',
  'none',
] as const;
const amount = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('fixed'),
    won: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  }),
  z.object({ kind: z.literal('none') }),
  z.object({ kind: z.literal('negotiable') }),
]);
const cycle = z.object({
  days: z.number().int().min(0).max(365),
  unit: z.enum(['business', 'calendar']),
});
const days = z.number().int().min(1).max(365);
export const policySchema = z
  .object({
    fees: AgreementRatesSchema,
    terms: z.object({
      insurance: amount,
      limit: amount,
      signupFee: amount,
      cycle,
    }),
    direct: z.object({
      insurance: amount.optional(),
      limit: amount.optional(),
      cycle: cycle.optional(),
    }),
    review: z.object({
      cashConvertible: z.boolean(),
      prices: z.array(z.enum(priceOptions)),
      sales: z.array(z.enum(saleOptions)),
      maxDeliveryDays: z.number().int().nonnegative().max(3650).nullable(),
    }),
    responseDays: z.number().int().min(2).max(730),
    validityDays: days,
    retryDays: days,
    ackDays: days,
    applicationDays: days,
    resultDays: days,
  })
  .refine(
    (p) =>
      p.responseDays > Math.max(p.ackDays, p.applicationDays, p.resultDays),
  );
export type Policy = z.infer<typeof policySchema>;
export const deadlineFields = {
  responseDays: 'PG 회신 링크 유효기간',
  validityDays: '가입 신청 유효기간',
  retryDays: '거절 후 재신청 기한',
  ackDays: '메일 수신 확인 기한',
  applicationDays: '외부 접수 확인 기한',
  resultDays: '심사 결과 회신 기한',
} as const;
export const prices = [
  '10만 원 미만',
  '10만~30만 원',
  '30만~50만 원',
  '50만~100만 원',
  '100만~200만 원',
  '200만~500만 원',
  '500만~1,000만 원',
  '1,000만~2,000만 원',
  '2,000만 원 이상',
];
export const sales = [
  '예약·주문 제작',
  '중고',
  '공동 구매',
  '해외 거래',
  '구독',
  '해당 없음',
];
export function readPolicyForm(f: FormData, oldFees: AgreementRate[] = []) {
  const number = (key: string) => {
    const v = f.get(key);
    return typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : undefined;
  };
  const readAmount = (key: string) => {
    const kind = f.get(key);
    return !kind
      ? undefined
      : kind === 'fixed'
        ? { kind, won: number(key + '.won') }
        : { kind };
  };
  const readCycle = (k: string) =>
    number(k) === undefined
      ? undefined
      : { days: number(k), unit: f.get(k + '.unit') };
  const parsed = parseAgreementRateForm(f, oldFees);
  if (!parsed.ok) return;
  return policySchema.safeParse({
    fees: parsed.rates,
    terms: {
      insurance: readAmount('insurance'),
      limit: readAmount('limit'),
      signupFee: readAmount('signupFee'),
      cycle: readCycle('cycle'),
    },
    direct: {
      insurance: readAmount('direct.insurance'),
      limit: readAmount('direct.limit'),
      cycle: readCycle('direct.cycle'),
    },
    review: {
      cashConvertible: f.has('cash'),
      prices: f.getAll('prices'),
      sales: f.getAll('sales'),
      maxDeliveryDays: f.get('maxDeliveryDays')
        ? number('maxDeliveryDays')
        : null,
    },
    ...Object.fromEntries(
      Object.keys(deadlineFields).map((k) => [k, number(k)]),
    ),
  }).data;
}
export function validStandards(p: Policy, raw: unknown) {
  const parsed = AgreementRatesSchema.safeParse(raw);
  if (!parsed.success) return false;
  const standard = new Map(parsed.data.map((r) => [r.key, r.rate])),
    keys = new Set(p.fees.map((r) => r.key));
  if (
    !keys.has('card:sole') ||
    p.fees.some(
      (r) =>
        r.key.startsWith('custom:') ||
        standard.get(r.key) === undefined ||
        Number(r.rate.toPrecision(15)) >
          Number(standard.get(r.key)!.toPrecision(15)),
    )
  )
    return false;
  return PAYMENT_METHODS.every(
    (m) =>
      !isTieredMethod(m) ||
      (!keys.has(m) &&
        (!p.fees.some((f) => f.key.startsWith(m + ':')) ||
          MERCHANT_TIERS.every((t) => keys.has(m + ':' + t)))),
  );
}
