import { describe, expect, it } from 'vitest';
import { currentTermsOf, solutionLabel } from '../rfp-terms';

describe('currentTermsOf', () => {
  it('null/undefined 는 빈 객체로 정규화한다', () => {
    expect(currentTermsOf(null)).toEqual({});
    expect(currentTermsOf(undefined)).toEqual({});
  });

  it('값이 있으면 그대로 통과시킨다 (관대한 읽기)', () => {
    expect(currentTermsOf({ _v: 1, feeRate: '3.5' })).toEqual({ _v: 1, feeRate: '3.5' });
  });
});

describe('solutionLabel', () => {
  it('알려진 솔루션 값은 한글 라벨로 변환한다', () => {
    expect(solutionLabel('cafe24')).toBe('카페24');
    expect(solutionLabel('self')).toBe('자체 개발');
  });

  it('어휘에 없는 값은 원문을 그대로 반환한다 (fail-open)', () => {
    expect(solutionLabel('shopify')).toBe('shopify');
  });

  it('null/undefined/빈 문자열은 undefined 를 반환한다', () => {
    expect(solutionLabel(null)).toBeUndefined();
    expect(solutionLabel(undefined)).toBeUndefined();
    expect(solutionLabel('')).toBeUndefined();
  });
});
