export const MERCHANT_TIERS = ['sole', 'sme1', 'sme2', 'sme3', 'general'] as const;
export type MerchantTier = (typeof MERCHANT_TIERS)[number];

export type BizProfile = {
  bizNo?: string;
  taxType?: 'general' | 'simple' | 'exempt';
  status?: 'active' | 'suspended' | 'closed';
  // 가맹점 영세·중소 등급 — 견적 수수료 구간(MerchantTier)과 단일 타입으로 통합됨(영세=sole).
  grade?: MerchantTier;
  gradeSource: 'user_confirmed' | 'user_overridden' | 'unset' | 'admin_confirmed';
  gradeConfirmedBy?: string;
  gradeConfirmedAt?: string;
};

// 가맹점 등급 라벨 — 영세/중소1~3/일반. 공백 없는 표기 — 'sme1' → '중소1'.
export const MERCHANT_TIER_LABELS: Record<MerchantTier, string> = {
  sole: '영세',
  sme1: '중소1',
  sme2: '중소2',
  sme3: '중소3',
  general: '일반',
};
