// RFP "현재 조건" 브리프의 버전드 JSONB 문서(rfps.current_terms) 표시용 타입.
// bidit(lib/types/rfp-terms.ts)의 표시 관련 부분집합 사본 — 쓰기 경로(zod 검증,
// migrateCurrentTerms 의 버전 홉)는 이 admin 앱이 갖지 않으므로 옮기지 않는다.
import { labelOf } from './label';

export const SOLUTION_VALUES = ['cafe24', 'imweb', 'makeshop', 'godo', 'self', 'other'] as const;
export type SolutionValue = (typeof SOLUTION_VALUES)[number];

// v1 모양. 모든 키 optional.
export type CurrentTermsV1 = {
  _v?: number;
  feeRate?: string;
  settlementLimit?: string;
  guaranteeInsurance?: string;
  settlementCycle?: string;
  deliveryServicePeriod?: string;
  solution?: SolutionValue | string;
  solutionDetail?: string;
  annualPgVolume?: string;
};

// currentTerms 의 모든 필드는 string 이어야 하지만 jsonb 라 DB 가 이를 강제하지
// 않는다 — 값이 객체/배열로 잘못 저장되면 React 가 "Objects are not valid as a
// React child" 로 페이지 전체를 500 낸다(코드 리뷰에서 지적됨). string 이 아닌
// 필드는 표시 직전에 undefined 로 떨어뜨려 그 행 자체를 숨긴다(DetailRow 는
// undefined 값을 렌더하지 않음).
const STRING_FIELDS = [
  'feeRate',
  'settlementLimit',
  'guaranteeInsurance',
  'settlementCycle',
  'deliveryServicePeriod',
  'solution',
  'solutionDetail',
  'annualPgVolume',
] as const satisfies readonly (keyof CurrentTermsV1)[];

/** 관대한 읽기 — rfps.current_terms 는 항상 이 모양이라고 가정하지 않는다. */
export function currentTermsOf(raw: unknown): CurrentTermsV1 {
  const o = (raw ?? {}) as Record<string, unknown>;
  const terms: CurrentTermsV1 = typeof o._v === 'number' ? { _v: o._v } : {};
  for (const key of STRING_FIELDS) {
    if (typeof o[key] === 'string') terms[key] = o[key] as string;
  }
  return terms;
}

// bidit(lib/rfp/solutions.ts)의 라벨 — SOLUTION_VALUES 와 1:1.
export const SOLUTION_LABELS: Record<SolutionValue, string> = {
  cafe24: '카페24',
  imweb: '아임웹',
  makeshop: '메이크샵',
  godo: '고도몰',
  self: '자체 개발',
  other: '기타',
};

/**
 * 저장된 solution 문자열 → 표시 라벨. 자유 텍스트 저장 컬럼이라 어휘 밖 값이
 * 올 수 있어 fail-open — 못 찾으면 원문을 그대로 보여준다.
 */
export function solutionLabel(solution?: string | null): string | undefined {
  if (!solution) return undefined;
  return labelOf(SOLUTION_LABELS, solution);
}

// PG에게 숨길 수 있는 필드 경로 — rfps.hidden_from_pg 에 담기는 값의 어휘.
// bidit(lib/types/rfp-terms.ts) 의 HIDEABLE_PG_PATHS 단일 항목.
export const STRIP_PATH_FEE_RATE = 'currentTerms.feeRate' as const;

// 계약 유형 라벨 — bidit(lib/types/rfp.ts) 사본.
export const CONTRACT_TYPE_LABELS = { new: '신규 계약', renewal: '갱신 계약' } as const;
