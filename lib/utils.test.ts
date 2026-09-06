import { describe, expect, it } from 'vitest';
import { formatKRW, formatPct, isSafeHttpUrl } from './utils';

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

  it('음수 요율도 부호를 보존한다', () => {
    expect(formatPct(-0.01)).toBe('-1.00%');
  });
});

describe('isSafeHttpUrl', () => {
  it('http/https 는 안전하다고 판단한다', () => {
    expect(isSafeHttpUrl('https://example.com')).toBe(true);
    expect(isSafeHttpUrl('http://example.com')).toBe(true);
  });

  it('javascript:/data: 등 실행 가능한 스킴은 차단한다', () => {
    expect(isSafeHttpUrl('javascript:alert(document.cookie)')).toBe(false);
    expect(isSafeHttpUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
  });

  it('파싱 불가능한 문자열은 차단한다', () => {
    expect(isSafeHttpUrl('not a url')).toBe(false);
    expect(isSafeHttpUrl('')).toBe(false);
  });
});
