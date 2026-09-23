import Link from 'next/link';
import { ADMIN_PAGE_SIZE, listQuery, type ListParams } from '@/lib/admin-list';

export function AdminListPagination({ path, params, page, total }: { path: string; params: ListParams; page: number; total: number }) {
  const last = Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE));
  const current = Math.min(page, last);
  const firstRow = total ? (current - 1) * ADMIN_PAGE_SIZE + 1 : 0;
  const lastRow = Math.min(current * ADMIN_PAGE_SIZE, total);
  const href = (target: number) => `${path}?${listQuery({ ...params, page: String(target) })}`;
  return (
    <nav aria-label="목록 페이지" className="flex flex-wrap items-center justify-between gap-3 text-body-small text-on-surface-variant">
      <span>전체 {total.toLocaleString()}건 · {firstRow.toLocaleString()}–{lastRow.toLocaleString()}건 표시</span>
      <div className="flex items-center gap-2">
        {current > 1 ? <Link href={href(current - 1)} className="rounded border border-outline-variant px-3 py-1.5 hover:bg-surface-container-low">이전</Link> : <span className="rounded border border-outline-variant px-3 py-1.5 opacity-40">이전</span>}
        <span className="md-numeric px-2">{current} / {last}</span>
        {current < last ? <Link href={href(current + 1)} className="rounded border border-outline-variant px-3 py-1.5 hover:bg-surface-container-low">다음</Link> : <span className="rounded border border-outline-variant px-3 py-1.5 opacity-40">다음</span>}
      </div>
    </nav>
  );
}
