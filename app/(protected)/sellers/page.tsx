import { listSellersPage } from '@/lib/server/queries/admin/sellers';
import { AdminListControls } from '@/components/AdminListControls';
import { AdminListPagination } from '@/components/AdminListPagination';
import { AdminDataTable, type AdminTableColumn } from '@/components/AdminDataTable';
import type { SellerRow } from '@/lib/server/queries/admin/sellers';
import { listQuery, type ListParams } from '@/lib/admin-list';
import Link from 'next/link';
import { AdminStatusBadge } from '@/components/AdminStatusBadge';
import { formatDateKST } from '@/lib/utils';

export default async function SellersPage({
  searchParams,
}: {
  searchParams: Promise<ListParams>;
}) {
  const params = await searchParams;
  const { q, status } = params;
  const { rows: sellers, total, page } = await listSellersPage(params);
  const returnTo = `/sellers?${listQuery(params)}`;
  const filtered = Boolean(q || status || params.from || params.to);
  const columns: AdminTableColumn<SellerRow>[] = [
    { key: 'name', label: '회사명', render: (s) => <Link href={`/sellers/${s.id}?returnTo=${encodeURIComponent(returnTo)}`} className="text-primary hover:underline">{s.name}</Link> },
    { key: 'status', label: '상태', render: (s) => <AdminStatusBadge status={s.status} /> },
    { key: 'createdAt', label: '가입일', render: (s) => <span className="md-numeric text-label-small text-on-surface-variant">{formatDateKST(s.createdAt)}</span> },
  ];

  return (
    <div className="space-y-4">
      <h1 className="text-headline-small font-semibold">판매사</h1>
      <AdminListControls path="/sellers" params={params} sortOptions={[{ value: 'name', label: '회사명순' }]} dateLabel="가입일">
        <input
          name="q"
          aria-label="판매사 회사명 검색"
          defaultValue={q ?? ''}
          placeholder="회사명 검색"
          className="rounded border border-outline-variant px-3 py-1.5 text-body-small bg-surface focus:outline-none focus:ring-1 focus:ring-primary w-64"
        />
        <select
          name="status"
          aria-label="판매사 상태"
          defaultValue={status ?? ''}
          className="rounded border border-outline-variant px-3 py-1.5 text-body-small bg-surface"
        >
          <option value="">전체</option>
          <option value="pending">대기</option>
          <option value="active">활성</option>
          <option value="suspended">정지</option>
        </select>
      </AdminListControls>
      <AdminDataTable caption="판매사 목록" rows={sellers} columns={columns} getKey={(s) => s.id} emptyMessage={filtered ? '검색 조건에 맞는 판매사가 없습니다.' : '등록된 판매사가 없습니다.'} />
      <AdminListPagination path="/sellers" params={params} page={page} total={total} />
    </div>
  );
}
