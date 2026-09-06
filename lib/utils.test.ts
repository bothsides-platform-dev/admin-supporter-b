import { describe, expect, it } from 'vitest';
import { formatKRW, formatPct } from './utils';

describe('formatKRW', () => {
  it('천 단위 콤마와 원 단위를 붙인다', () => {
    expect(formatKRW(50000000)).toBe('50,000,000원');
    expect(formatKRW(0)).toBe('0원');
  });
});

describe('formatPct', () => {
  it('소수 요율을 백분율 문자열로 변환한다 (기본 소수점 2자리)', () => {
    expect(formatPct(0.0125)).toBe('1.25%');
    expect(formatPct(0.02)).toBe('2.00%');
  });

  it('digits 인자로 소수점 자리수를 조절한다', () => {
    expect(formatPct(0.0125, 0)).toBe('1%');
  });
});
