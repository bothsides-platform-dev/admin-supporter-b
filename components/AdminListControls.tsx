import type { ReactNode } from 'react';
import { listQuery, type ListParams } from '@/lib/admin-list';
import { AdminAppliedFilters, type AppliedFilter } from './AdminAppliedFilters';
import { AdminViewTabs } from './AdminViewTabs';

export type StatusView = { value: string; label: string };

/**
 * 목록 공통 조작부: 상태별 보기 탭, 검색·기간·정렬 폼, 적용된 필터 칩.
 *
 * - `statusViews` 를 주면 상태는 탭으로 고르고, 폼에는 hidden 값으로만 실어
 *   검색해도 보던 탭이 유지된다. `params.status` 는 페이지가 기본값을 풀어서
 *   넘긴 값이어야 한다(예: 입점 심사의 `open`).
 * - 검색어·기간 칩은 자동으로 만들고, 그 밖의 필터(유형 등)는 `extraFilters`
 *   로 표시 문구와 함께 넘긴다.
 */
export function AdminListControls({ path, params, viewParams = params, children, dateLabel = '등록일', sortOptions, statusViews, statusLabel = '상태별 보기', extraFilters = [] }: {
  path: string;
  params: ListParams;
  /** 탭 주소를 만들 때 쓸 값. 페이지가 정렬 기본값을 풀어서 넘길 때, 탭에는 사용자가 고른 값만 실으려고 따로 받는다. */
  viewParams?: ListParams;
  children: ReactNode;
  dateLabel?: string;
  sortOptions?: { value: string; label: string }[];
  statusViews?: StatusView[];
  statusLabel?: string;
  extraFilters?: AppliedFilter[];
}) {
  const current = params.status ?? '';
  const filters: AppliedFilter[] = [
    ...(params.q ? [{ key: 'q', label: '검색', value: params.q } satisfies AppliedFilter] : []),
    ...extraFilters,
    ...(params.from ? [{ key: 'from', label: `${dateLabel} 시작`, value: params.from } satisfies AppliedFilter] : []),
    ...(params.to ? [{ key: 'to', label: `${dateLabel} 끝`, value: params.to } satisfies AppliedFilter] : []),
  ];
  return (
    <div className="space-y-3">
      {statusViews && (
        <AdminViewTabs
          label={statusLabel}
          tabs={statusViews.map((view) => {
            const query = listQuery({ ...viewParams, status: view.value, page: undefined });
            return { label: view.label, href: query ? `${path}?${query}` : path, active: view.value === current };
          })}
        />
      )}
      <form method="GET" className="flex flex-wrap items-end gap-2">
        {statusViews && current && <input type="hidden" name="status" value={current} />}
        {children}
        <label className="flex flex-col gap-1 text-label-small text-on-surface-variant">
          {dateLabel} 시작
          <input type="date" name="from" defaultValue={params.from ?? ''} className="rounded border border-outline-variant bg-surface px-2 py-1.5 text-body-small" />
        </label>
        <label className="flex flex-col gap-1 text-label-small text-on-surface-variant">
          {dateLabel} 끝
          <input type="date" name="to" defaultValue={params.to ?? ''} className="rounded border border-outline-variant bg-surface px-2 py-1.5 text-body-small" />
        </label>
        <label className="flex flex-col gap-1 text-label-small text-on-surface-variant">
          정렬
          <select name="sort" defaultValue={params.sort ?? 'newest'} className="rounded border border-outline-variant bg-surface px-2 py-1.5 text-body-small">
            <option value="newest">최신순</option>
            <option value="oldest">오래된 순</option>
            {sortOptions?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <button type="submit" className="rounded bg-primary px-3 py-1.5 text-label-small text-on-primary">검색</button>
      </form>
      <AdminAppliedFilters path={path} params={params} filters={filters} />
    </div>
  );
}
