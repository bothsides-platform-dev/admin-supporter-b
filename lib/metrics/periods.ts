// 지표 화면의 날짜·주 경계는 모두 KST(UTC+9, 서머타임 없음) 기준이다.
// lib/admin-list.ts 의 dateBounds 와 같은 기준을 쓴다.

const HOUR_MS = 3_600_000;
export const DAY_MS = 24 * HOUR_MS;
export const WEEK_MS = 7 * DAY_MS;
const KST_OFFSET_MS = 9 * HOUR_MS;

/** KST 벽시계 값을 UTC 필드로 읽을 수 있게 옮긴 Date. 계산용이며 실제 시각이 아니다. */
function kstWallClock(at: Date): Date {
  return new Date(at.getTime() + KST_OFFSET_MS);
}

/** 주어진 시각이 속한 KST 날짜의 00:00. */
export function kstDayStart(at: Date): Date {
  const wall = kstWallClock(at);
  return new Date(Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate()) - KST_OFFSET_MS);
}

/** 주어진 시각이 속한 KST 주의 월요일 00:00. */
export function kstWeekStart(at: Date): Date {
  const dayStart = kstDayStart(at);
  const weekday = kstWallClock(dayStart).getUTCDay(); // 0 = 일요일
  return new Date(dayStart.getTime() - ((weekday + 6) % 7) * DAY_MS);
}

/** KST 날짜 키 'YYYY-MM-DD'. 문자열 비교가 곧 날짜 비교다. */
export function kstDateKey(at: Date): string {
  return kstWallClock(at).toISOString().slice(0, 10);
}

function monthDay(at: Date): string {
  const wall = kstWallClock(at);
  return `${wall.getUTCMonth() + 1}/${wall.getUTCDate()}`;
}

export type WeekBucket = {
  start: Date;
  /** 다음 주 월요일 00:00 (포함하지 않음). */
  end: Date;
  /** 월요일~일요일, 예: '11/9~11/15'. */
  label: string;
  /** 아직 끝나지 않은 주. 건수가 더 늘 수 있다. */
  inProgress: boolean;
};

/** 현재 주를 포함한 최근 N주. 오래된 주부터 정렬한다. */
export function weekBuckets(now: Date, weeks: number): WeekBucket[] {
  const current = kstWeekStart(now).getTime();
  return Array.from({ length: weeks }, (_, index) => {
    const start = new Date(current - (weeks - 1 - index) * WEEK_MS);
    const end = new Date(start.getTime() + WEEK_MS);
    return {
      start,
      end,
      label: `${monthDay(start)}~${monthDay(new Date(end.getTime() - DAY_MS))}`,
      inProgress: end.getTime() > now.getTime(),
    };
  });
}

/** 시각이 속한 버킷의 위치. 범위 밖이면 -1. */
export function bucketIndex(buckets: readonly WeekBucket[], at: Date): number {
  if (buckets.length === 0) return -1;
  const index = Math.floor((at.getTime() - buckets[0].start.getTime()) / WEEK_MS);
  return index >= 0 && index < buckets.length ? index : -1;
}

export const WEEK_OPTIONS = [4, 12, 26, 52] as const;
export const DEFAULT_WEEKS = 12;

/** URL 의 weeks 값. 허용 목록 밖이면 기본값. */
export function parseWeeks(value?: string): number {
  const weeks = Number(value);
  return (WEEK_OPTIONS as readonly number[]).includes(weeks) ? weeks : DEFAULT_WEEKS;
}
