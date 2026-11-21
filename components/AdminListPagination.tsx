import Link from 'next/link';
import { ADMIN_PAGE_SIZE, listQuery, type ListParams } from '@/lib/admin-list';

/**
 * 목록 공통 페이지 이동. 기본은 `listQuery(params)` 로 주소를 만들고,
 * 공통 파라미터 밖의 필터를 쓰는 목록(감사 로그)은 `hrefFor` 로 직접 만든다.
 */
export function AdminListPagination({ path, params, page, total, pageSize = ADMIN_PAGE_SIZE, hrefFor }: {
  path: string;
  params?: ListParams;
  page: number;
  total: number;
  pageSize?: number;
  hrefFor?: (page: number) => string;
}) {
  const last = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(page, last);
  const firstRow = total ? (current - 1) * pageSize + 1 : 0;
  const lastRow = Math.min(current * pageSize, total);
  const href = hrefFor ?? ((target: number) => `${path}?${listQuery({ ...params, page: String(target) })}`);
  return (
    <nav aria-label="목록 페이지" className="flex flex-wrap items-center justify-between gap-3 text-body-small text-on-surface-variant">
      <span>전체 {total.toLocaleString()}건, {firstRow.toLocaleString()}–{lastRow.toLocaleString()}건 표시</span>
      <div className="flex items-center gap-2">
        {current > 1 ? <Link href={href(current - 1)} data-pressable className="rounded border border-outline-variant px-3 py-1.5 hover:bg-surface-container-low">이전</Link> : <span className="rounded border border-outline-variant px-3 py-1.5 opacity-40">이전</span>}
        <span className="md-numeric px-2">{current} / {last}</span>
        {current < last ? <Link href={href(current + 1)} data-pressable className="rounded border border-outline-variant px-3 py-1.5 hover:bg-surface-container-low">다음</Link> : <span className="rounded border border-outline-variant px-3 py-1.5 opacity-40">다음</span>}
      </div>
    </nav>
  );
}
