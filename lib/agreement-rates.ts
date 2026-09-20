import { z } from 'zod';
import {
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  MERCHANT_TIERS,
  MERCHANT_TIER_LABELS,
  isFlatFeeMethod,
} from '@/lib/types/bid';

// Shared storage contract with bidit/lib/contract-doc/agreement.ts.
// Percentage rates are fractions; virtual_account is integer KRW per payment.
const tiered = new Set(['card', 'naver_pay', 'kakao_pay', 'toss_pay', 'apple_pay', 'samsung_pay']);
export const AGREEMENT_RATE_OPTIONS = PAYMENT_METHODS.flatMap((method) =>
  tiered.has(method)
    ? [
        { key: method, label: `${PAYMENT_METHOD_LABELS[method]} · 단일요율`, flat: false },
        ...MERCHANT_TIERS.map((tier) => ({
          key: `${method}:${tier}`,
          label: `${PAYMENT_METHOD_LABELS[method]} · ${MERCHANT_TIER_LABELS[tier]}`,
          flat: false,
        })),
      ]
    : [{ key: method, label: PAYMENT_METHOD_LABELS[method], flat: isFlatFeeMethod(method) }],
);
const keys = new Set(AGREEMENT_RATE_OPTIONS.map((o) => o.key));
export const AgreementRatesSchema = z
  .array(
    z.object({ key: z.string().min(1).max(140), rate: z.number().finite().nonnegative() }).strict(),
  )
  .max(100)
  .superRefine((rows, ctx) => {
    const seen = new Set<string>();
    rows.forEach((row, index) => {
      if (
        (!keys.has(row.key) && !/^custom:[\s\S]{1,100}$/.test(row.key)) ||
        seen.has(row.key) ||
        (row.key === 'virtual_account'
          ? !Number.isInteger(row.rate) || row.rate > 1000000
          : row.rate > 1)
      ) {
        ctx.addIssue({ code: 'custom', path: [index], message: '수수료 기준을 확인해주세요.' });
      }
      seen.add(row.key);
    });
  });
export type AgreementRate = z.infer<typeof AgreementRatesSchema>[number];

export function agreementRateInputValue(rate: number, flat: boolean): string {
  if (flat) return String(rate);
  const [mantissa, exponent = '0'] = String(rate).split('e');
  const [whole, fraction = ''] = mantissa.split('.');
  const digits = `${whole}${fraction}`.replace(/^0+(?=\d)/, '');
  const point = digits.length - fraction.length + Number(exponent) + 2;
  const shifted =
    point <= 0
      ? `0.${'0'.repeat(-point)}${digits}`
      : point >= digits.length
        ? `${digits}${'0'.repeat(point - digits.length)}`
        : `${digits.slice(0, point)}.${digits.slice(point)}`;
  return shifted.replace(/^0+(?=\d)/, '').replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
}

export function parseAgreementRateForm(
  form: FormData,
  originalRates: AgreementRate[] = [],
): { ok: true; rates: AgreementRate[] } | { ok: false } {
  const rates: AgreementRate[] = [];
  const originals = new Map(originalRates.map((rate) => [rate.key, rate.rate]));
  for (const option of AGREEMENT_RATE_OPTIONS) {
    const value = String(form.get(`rate:${option.key}`) ?? '').trim();
    if (!value) continue;
    const original = originals.get(option.key);
    if (original !== undefined && value === agreementRateInputValue(original, option.flat)) {
      rates.push({ key: option.key, rate: original });
    } else {
      if (!/^\d+(\.\d+)?$/.test(value)) return { ok: false };
      rates.push({ key: option.key, rate: Number(value) / (option.flat ? 1 : 100) });
    }
  }
  const customLabels = form.getAll('customLabel');
  const customRates = form.getAll('customRate');
  if (customLabels.length !== customRates.length) return { ok: false };
  for (let index = 0; index < customLabels.length; index += 1) {
    const label = String(customLabels[index]);
    const value = String(customRates[index]).trim();
    if (!label && !value) continue;
    if (!label) return { ok: false };
    const key = `custom:${label}`;
    const original = originals.get(key);
    if (original !== undefined && value === agreementRateInputValue(original, false)) {
      rates.push({ key, rate: original });
    } else {
      if (!/^\d+(\.\d+)?$/.test(value)) return { ok: false };
      rates.push({ key, rate: Number(value) / 100 });
    }
  }
  const parsed = AgreementRatesSchema.safeParse(rates);
  return parsed.success ? { ok: true, rates: parsed.data } : { ok: false };
}
