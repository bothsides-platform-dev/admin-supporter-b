// 지표 화면의 표시 규칙. 표본이 작을 때 숫자가 과장돼 보이지 않게 하는 것이 목적이다.
import type { Ratio } from './compute';

/** 분모가 이보다 작으면 퍼센트를 붙이지 않는다 — 한두 건에 수십 %p 가 움직인다. */
export const MIN_PERCENT_DENOMINATOR = 10;

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

export function formatCount(value: number): string {
  return value.toLocaleString('ko-KR');
}

/** 항상 분자/분모를 보여준다. 분모가 0 이면 '—', 충분히 크면 퍼센트를 덧붙인다. */
export function formatRatio({ num, den }: Ratio): string {
  if (den === 0) return '—';
  const fraction = `${formatCount(num)}/${formatCount(den)}`;
  return den < MIN_PERCENT_DENOMINATOR ? fraction : `${fraction} (${Math.round((num / den) * 100)}%)`;
}

function trimmed(value: number): string {
  return value.toFixed(1).replace(/\.0$/, '');
}

/** 소요 시간: 분 → 시간 → 일. 알 수 없으면 '—'. */
export function formatDuration(ms: number | null): string {
  if (ms === null) return '—';
  if (ms < MINUTE_MS) return '1분 미만';
  if (ms < HOUR_MS) return `${Math.round(ms / MINUTE_MS)}분`;
  if (ms < 2 * DAY_MS) return `${trimmed(ms / HOUR_MS)}시간`;
  return `${trimmed(ms / DAY_MS)}일`;
}
