import { describe, expect, it } from 'vitest';
import { labelOf } from '../label';

describe('labelOf', () => {
  it('어휘에 있는 키는 라벨로 변환한다', () => {
    expect(labelOf({ a: '에이', b: '비' }, 'a')).toBe('에이');
  });

  it('어휘에 없는 키는 원문을 그대로 반환한다 (fail-open)', () => {
    expect(labelOf({ a: '에이' }, 'z')).toBe('z');
  });

  it('프로토타입 체인의 값을 라벨로 오인하지 않는다', () => {
    expect(labelOf({ a: '에이' }, 'constructor')).toBe('constructor');
  });
});
