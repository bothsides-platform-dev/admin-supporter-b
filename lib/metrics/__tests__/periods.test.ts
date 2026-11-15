import { describe, expect, it } from 'vitest';
import { bucketIndex, kstDateKey, kstDayStart, kstWeekStart, parseWeeks, weekBuckets } from '../periods';

const at = (iso: string) => new Date(iso);

describe('KST 날짜 경계', () => {
  it('KST 자정을 기준으로 날짜를 나눈다', () => {
    // 2026-11-15 23:30 KST 와 2026-11-16 00:30 KST
    expect(kstDateKey(at('2026-11-15T14:30:00Z'))).toBe('2026-11-15');
    expect(kstDateKey(at('2026-11-15T15:30:00Z'))).toBe('2026-11-16');
    expect(kstDayStart(at('2026-11-15T14:30:00Z')).toISOString()).toBe('2026-11-14T15:00:00.000Z');
  });

  it('일요일 23:30 과 월요일 00:30 (KST) 을 서로 다른 주로 본다', () => {
    const sundayNight = kstWeekStart(at('2026-11-15T14:30:00Z'));
    const mondayMorning = kstWeekStart(at('2026-11-15T15:30:00Z'));

    expect(sundayNight.toISOString()).toBe('2026-11-08T15:00:00.000Z'); // 11/9(월) 00:00 KST
    expect(mondayMorning.toISOString()).toBe('2026-11-15T15:00:00.000Z'); // 11/16(월) 00:00 KST
  });

  it('월요일 00:00 KST 는 그 주의 시작이다', () => {
    expect(kstWeekStart(at('2026-11-08T15:00:00Z')).toISOString()).toBe('2026-11-08T15:00:00.000Z');
  });
});

describe('주간 버킷', () => {
  const now = at('2026-11-15T03:00:00Z'); // 일요일 12:00 KST
  const buckets = weekBuckets(now, 4);

  it('현재 주를 포함해 오래된 주부터 N개를 만든다', () => {
    expect(buckets.map((bucket) => bucket.label)).toEqual([
      '10/19~10/25', '10/26~11/1', '11/2~11/8', '11/9~11/15',
    ]);
    expect(buckets[0].start.toISOString()).toBe('2026-10-18T15:00:00.000Z');
    expect(buckets[3].end.toISOString()).toBe('2026-11-15T15:00:00.000Z');
  });

  it('끝나지 않은 주만 진행 중으로 표시한다', () => {
    expect(buckets.map((bucket) => bucket.inProgress)).toEqual([false, false, false, true]);
  });

  it('시각이 속한 버킷을 찾고 범위 밖은 -1 을 돌려준다', () => {
    expect(bucketIndex(buckets, at('2026-10-18T15:00:00Z'))).toBe(0);
    expect(bucketIndex(buckets, at('2026-11-15T14:59:59Z'))).toBe(3);
    expect(bucketIndex(buckets, at('2026-10-18T14:59:59Z'))).toBe(-1);
    expect(bucketIndex(buckets, at('2026-11-15T15:00:00Z'))).toBe(-1);
    expect(bucketIndex([], now)).toBe(-1);
  });
});

describe('parseWeeks', () => {
  it('허용한 기간만 받고 나머지는 기본 12주로 돌린다', () => {
    expect(parseWeeks('26')).toBe(26);
    expect(parseWeeks('4')).toBe(4);
    expect(parseWeeks('7')).toBe(12);
    expect(parseWeeks('abc')).toBe(12);
    expect(parseWeeks(undefined)).toBe(12);
  });
});
