import Link from 'next/link';
import type { ReactNode } from 'react';
import type { ListParams } from '@/lib/admin-list';

export function AdminListControls({ path, params, children, dateLabel = '등록일', sortOptions }: {
  path: string;
  params: ListParams;
  children: ReactNode;
  dateLabel?: string;
  sortOptions?: { value: string; label: string }[];
}) {
  return (
    <form method="GET" className="flex flex-wrap items-end gap-2">
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
      <Link href={path} className="rounded border border-outline-variant px-3 py-1.5 text-label-small hover:bg-surface-container-low">초기화</Link>
    </form>
  );
}
