import { listAllRfpsPage } from '@/lib/server/queries/admin/rfps';
import { AdminListControls } from '@/components/AdminListControls';
import { AdminListPagination } from '@/components/AdminListPagination';
import { AdminDataTable, type AdminTableColumn } from '@/components/AdminDataTable';
import type { RfpListRow } from '@/lib/server/queries/admin/rfps';
import { listQuery, type ListParams } from '@/lib/admin-list';
import Link from 'next/link';
import { AdminStatusBadge } from '@/components/AdminStatusBadge';
import { formatDateKST } from '@/lib/utils';

export default async function RfpsPage({
  searchParams,
}: {
  searchParams: Promise<ListParams>;
}) {
  const params = await searchParams;
  const { q, status } = params;
  const { rows: rfpList, total, page } = await listAllRfpsPage(params);
  const returnTo = `/rfps?${listQuery(params)}`;
  const filtered = Boolean(q || status || params.from || params.to);
  const columns: AdminTableColumn<RfpListRow>[] = [
    { key: 'code', label: '코드', render: (rfp) => <span className="md-numeric text-label-small text-on-surface-variant">{rfp.code}</span> },
    { key: 'title', label: '제목', render: (rfp) => <Link href={`/rfps/${rfp.id}?returnTo=${encodeURIComponent(returnTo)}`} className="text-primary hover:underline">{rfp.title}</Link> },
    { key: 'buyerName', label: '구매사', render: (rfp) => <Link href={`/buyers/${rfp.buyerWsId}`} className="text-on-surface hover:underline">{rfp.buyerName}</Link> },
    { key: 'status', label: '상태', render: (rfp) => <AdminStatusBadge status={rfp.status} /> },
    { key: 'deadline', label: '마감', render: (rfp) => <span className="md-numeric text-label-small text-on-surface-variant">{formatDateKST(rfp.deadline)}</span> },
  ];

  return (
    <div className="space-y-4">
      <h1 className="text-headline-small font-semibold">RFP 전체 목록</h1>
      <AdminListControls path="/rfps" params={params} sortOptions={[{ value: 'deadline', label: '마감 임박순' }]} dateLabel="마감일">
        <input
          name="q"
          aria-label="RFP 제목 또는 코드 검색"
          defaultValue={q ?? ''}
          placeholder="제목 또는 코드 검색"
          className="rounded border border-outline-variant px-3 py-1.5 text-body-small bg-surface focus:outline-none focus:ring-1 focus:ring-primary w-64"
        />
        <select
          name="status"
          aria-label="RFP 상태"
          defaultValue={status ?? ''}
          className="rounded border border-outline-variant px-3 py-1.5 text-body-small bg-surface"
        >
          <option value="">전체</option>
          <option value="draft">초안</option>
          <option value="sent">발송</option>
          <option value="closed">마감</option>
          <option value="cancelled">취소</option>
          <option value="awarded">낙찰</option>
        </select>
      </AdminListControls>
      <AdminDataTable caption="RFP 목록" rows={rfpList} columns={columns} getKey={(rfp) => rfp.id} emptyMessage={filtered ? '검색 조건에 맞는 RFP가 없습니다.' : '등록된 RFP가 없습니다.'} />
      <AdminListPagination path="/rfps" params={params} page={page} total={total} />
    </div>
  );
}
