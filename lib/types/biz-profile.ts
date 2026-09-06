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

export type TaxType = 'general' | 'simple' | 'exempt';

export const TAX_TYPE_LABELS: Record<TaxType, string> = {
  general: '일반과세',
  simple: '간이과세',
  exempt: '면세',
};

// biz_profiles.grade_source — 영중소구간이 어떻게 확정됐는지. admin 이 직접
// 확인한 값(admin_confirmed)인지, 사용자가 답하거나 정정한 값인지 구분해 보여준다.
export type GradeSource = 'user_confirmed' | 'user_overridden' | 'unset' | 'admin_confirmed';

export const GRADE_SOURCE_LABELS: Record<GradeSource, string> = {
  user_confirmed: '사용자 확인',
  user_overridden: '사용자 정정',
  unset: '미설정',
  admin_confirmed: '관리자 확인',
};
