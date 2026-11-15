import { describe, expect, it } from 'vitest';
import { formatCount, formatDuration, formatRatio } from '../format';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe('formatRatio', () => {
  it('분모가 0 이면 줄표를 보여준다', () => {
    expect(formatRatio({ num: 0, den: 0 })).toBe('—');
  });

  it('분모가 10 미만이면 퍼센트 없이 분자/분모만 보여준다', () => {
    expect(formatRatio({ num: 1, den: 2 })).toBe('1/2');
    expect(formatRatio({ num: 0, den: 9 })).toBe('0/9');
  });

  it('분모가 10 이상이면 퍼센트를 덧붙인다', () => {
    expect(formatRatio({ num: 3, den: 10 })).toBe('3/10 (30%)');
    expect(formatRatio({ num: 1234, den: 2000 })).toBe('1,234/2,000 (62%)');
  });
});

describe('formatDuration', () => {
  it('크기에 맞는 단위로 줄인다', () => {
    expect(formatDuration(null)).toBe('—');
    expect(formatDuration(0)).toBe('1분 미만');
    expect(formatDuration(30 * MINUTE)).toBe('30분');
    expect(formatDuration(HOUR)).toBe('1시간');
    expect(formatDuration(1.5 * HOUR)).toBe('1.5시간');
    expect(formatDuration(47 * HOUR)).toBe('47시간');
    expect(formatDuration(2 * DAY)).toBe('2일');
    expect(formatDuration(8.9 * DAY)).toBe('8.9일');
  });
});

describe('formatCount', () => {
  it('천 단위 구분자를 넣는다', () => {
    expect(formatCount(0)).toBe('0');
    expect(formatCount(12345)).toBe('12,345');
  });
});
