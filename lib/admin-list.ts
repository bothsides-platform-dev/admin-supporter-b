export const ADMIN_PAGE_SIZE = 25;

export type ListParams = {
  q?: string;
  status?: string;
  type?: string;
  from?: string;
  to?: string;
  sort?: string;
  page?: string;
};

export function pageNumber(value?: string): number {
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? Math.min(n, 100000) : 1;
}

export function dateBounds(from?: string, to?: string) {
  const valid = (value?: string) => value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00+09:00`));
  const fromDate = valid(from) ? new Date(`${from}T00:00:00+09:00`) : undefined;
  const toDate = valid(to) ? new Date(new Date(`${to}T00:00:00+09:00`).getTime() + 86_400_000) : undefined;
  return { fromDate, toDate };
}

export function listQuery(params: ListParams) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value && ['q', 'status', 'type', 'from', 'to', 'sort', 'page'].includes(key)) query.set(key, value);
  }
  return query.toString();
}
