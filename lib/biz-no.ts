// 공백·하이픈류·점·슬래시만 구분자로 본다. 그 밖의 문자가 섞이면 번호를 신뢰하지 않는다.
const BIZ_NO_SEPARATORS = /[\s\-./‐-―−－]/g;
const CHECKSUM_WEIGHTS = [1, 3, 7, 1, 3, 7, 1, 3, 5] as const;

/** 구분자를 뺀 10자리 사업자등록번호가 체크섬(bidit lib/validation/biz-no.ts와 같은 규칙)까지 맞으면 숫자열을, 아니면 null을 돌려준다. */
export function normalizeBizNo(value: string | null | undefined): string | null {
  const digits = value?.replace(BIZ_NO_SEPARATORS, '');
  if (!digits || !/^\d{10}$/.test(digits)) return null;
  const d = [...digits].map(Number);
  const sum = CHECKSUM_WEIGHTS.reduce((acc, weight, i) => acc + d[i] * weight, 0) + Math.floor((d[8] * 5) / 10);
  return (10 - (sum % 10)) % 10 === d[9] ? digits : null;
}
