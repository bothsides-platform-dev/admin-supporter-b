import Link from 'next/link';
import { listQuery, type ListParams } from '@/lib/admin-list';

export type AppliedFilter = { key: keyof ListParams; label: string; value: string };

/** 주소에서 `key` 와 페이지 번호를 뺀 목록 주소. */
function without(path: string, params: ListParams, keys: (keyof ListParams)[]): string {
  const next: ListParams = { ...params, page: undefined };
  for (const key of keys) next[key] = undefined;
  const query = listQuery(next);
  return query ? `${path}?${query}` : path;
}

/**
 * 지금 걸려 있는 검색·필터를 칩으로 보여 주고 하나씩 또는 한꺼번에 지운다.
 * 상태(보기 탭)와 정렬은 필터가 아니므로 지워도 그대로 남는다.
 */
export function AdminAppliedFilters({ path, params, filters }: { path: string; params: ListParams; filters: AppliedFilter[] }) {
  if (filters.length === 0) return null;
  return (
    <ul aria-label="적용된 필터" className="flex flex-wrap items-center gap-2 text-label-small">
      {filters.map((filter) => (
        <li key={filter.key}>
          <Link
            href={without(path, params, [filter.key])}
            aria-label={`${filter.label} ${filter.value} 필터 지우기`}
            data-pressable
            className="inline-flex items-center gap-1.5 rounded border border-outline-variant bg-surface-container-low px-2 py-1 hover:bg-surface-container-high"
          >
            <span className="text-on-surface-variant">{filter.label}</span>
            <span className="max-w-48 truncate">{filter.value}</span>
            <span aria-hidden="true">✕</span>
          </Link>
        </li>
      ))}
      {filters.length > 1 && (
        <li>
          <Link href={without(path, params, filters.map((filter) => filter.key))} className="px-1 py-1 text-primary hover:underline">
            필터 모두 지우기
          </Link>
        </li>
      )}
    </ul>
  );
}
