export const TASK_CATEGORIES = {
  contact: '후속 연락',
  signing: '서명 동기화 확인',
  delivery: '메일 발송 결과 확인',
  terms: '견적 조건 확인',
} as const;
export const TASK_VIEWS = {
  open: '진행 중',
  unassigned: '미배정',
  today: '오늘 할 일',
  overdue: '기한 지남',
  done: '완료',
} as const;
export type TaskView = keyof typeof TASK_VIEWS;
export type TaskCategory = keyof typeof TASK_CATEGORIES;
export type TaskParams = { view?: string; workspace?: string; rfp?: string; page?: string; target?: string };

export function tasksHref(params: TaskParams) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params))
    if (typeof value === 'string' && value) query.set(key, value);
  return query.size ? `/tasks?${query}` : '/tasks';
}

export function readKstTime(raw: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw)) return null;
  const date = new Date(raw + ':00+09:00');
  if (!Number.isFinite(date.getTime())) return null;
  return toKstInput(date) === raw ? date : null;
}

export function toKstInput(date: Date) {
  return new Date(date.getTime() + 9 * 3600_000).toISOString().slice(0, 16);
}

export function validChannelUrl(value: string) {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !url.port &&
      (url.hostname === 'channel.io' || url.hostname.endsWith('.channel.io'))
    );
  } catch {
    return false;
  }
}
