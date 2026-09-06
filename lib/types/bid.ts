import { MERCHANT_TIERS, MERCHANT_TIER_LABELS, type MerchantTier } from './biz-profile';

// 결제수단 어휘의 단일 출처. bidit(lib/types/bid.ts)의 정식 사본 — 새 수단이
// 추가되면 이 배열 + 아래 LABELS 를 함께 갱신한다. 어휘가 뒤처져도 화면이 죽지
// 않도록 라벨 조회는 항상 paymentMethodLabel()/merchantTierLabel() 을 거친다
// (fail-open — 못 찾으면 원문 키를 그대로 보여준다).
export const PAYMENT_METHODS = [
  'card',
  'overseas_card',
  'virtual_account',
  'bank_transfer',
  'naver_pay',
  'kakao_pay',
  'toss_pay',
  'apple_pay',
  'samsung_pay',
  'mobile',
  'gift_card',
] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  card: '카드',
  overseas_card: '해외카드',
  virtual_account: '가상계좌',
  bank_transfer: '계좌이체',
  naver_pay: '네이버페이',
  kakao_pay: '카카오페이',
  toss_pay: '토스페이',
  apple_pay: '애플페이',
  samsung_pay: '삼성페이',
  mobile: '휴대폰결제',
  gift_card: '상품권',
};

/**
 * 관대한 라벨 조회. bidit 에 새 결제수단이 추가되고 admin 의 사본이 아직
 * 뒤처져 있어도 빈 칸 대신 원문 키를 보여준다(fail-open).
 */
export function paymentMethodLabel(method: string): string {
  return Object.hasOwn(PAYMENT_METHOD_LABELS, method)
    ? PAYMENT_METHOD_LABELS[method as PaymentMethod]
    : method;
}

// 영세·중소가맹점 등급 어휘는 lib/types/biz-profile.ts 가 단일 출처 — 여기서는
// 재export 만 한다(두 번째 출처를 만들지 않기 위해).
export { MERCHANT_TIERS, MERCHANT_TIER_LABELS };
export type { MerchantTier };

export function merchantTierLabel(tier: string): string {
  return Object.hasOwn(MERCHANT_TIER_LABELS, tier)
    ? MERCHANT_TIER_LABELS[tier as MerchantTier]
    : tier;
}

// 소수 요율의 구간맵 (부분 허용 — 일부 구간만 채워도 됨)
export type TierRates = Partial<Record<MerchantTier, number>>;

// 정액(건당) 수단 — 수수료가 정률(%)이 아니라 결제 건당 고정 금액(정수 원)으로
// 부과된다. paymentFees[정액수단] 의 number 값은 0~1 소수 요율이 아니라 '원'
// 단위 정수다. bidit lib/types/bid.ts 의 isFlatFeeMethod 와 동일 판별.
const FLAT_FEE_METHODS: ReadonlySet<PaymentMethod> = new Set<PaymentMethod>(['virtual_account']);

export function isFlatFeeMethod(m: string): boolean {
  return FLAT_FEE_METHODS.has(m as PaymentMethod);
}

// 구매사 직접입력 커스텀 결제수단. id는 서버가 발급, label만 화면에 쓴다.
export type CustomPaymentMethod = {
  id: string;
  label: string;
};

// bids.payment_fees / bids.custom_fees 컬럼(jsonb)의 관대한 표시용 타입.
// 실제 저장값 모양을 강제하지 않고 읽기 쪽에서만 좁혀 쓴다.
export type PaymentFeesDisplay = Partial<Record<string, number | TierRates>>;
export type CustomFeesDisplay = Record<string, number>;
