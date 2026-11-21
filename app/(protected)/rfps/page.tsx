import { AdminPageHeader } from '@/components/AdminPageHeader';
import { listAllRfpsPage } from '@/lib/server/queries/admin/rfps';
import { AdminListControls } from '@/components/AdminListControls';
import { AdminListPagination } from '@/components/AdminListPagination';
import { RfpViewTabs } from '@/components/RfpViewTabs';
import { AdminDataTable, type AdminTableColumn } from '@/components/AdminDataTable';
import type { RfpListRow } from '@/lib/server/queries/admin/rfps';
import { clearedListHref, hasListFilters, listQuery, type ListParams } from '@/lib/admin-list';
import Link from 'next/link';
import { AdminStatusBadge } from '@/components/AdminStatusBadge';
import { formatDateKST } from '@/lib/utils';

export const metadata = { title: 'RFP' };

export default async function RfpsPage({
  searchParams,
}: {
  searchParams: Promise<ListParams>;
}) {
  const params = await searchParams;
  const { q, status } = params;
  const { rows: rfpList, total, page } = await listAllRfpsPage(params);
  const returnTo = `/rfps?${listQuery(params)}`;
  const filtered = hasListFilters(params);
  const columns: AdminTableColumn<RfpListRow>[] = [
    { key: 'code', label: '코드', render: (rfp) => <span className="md-numeric text-label-small text-on-surface-variant">{rfp.code}</span> },
    { key: 'title', label: '제목', render: (rfp) => <Link href={`/rfps/${rfp.id}?returnTo=${encodeURIComponent(returnTo)}`} className="text-primary hover:underline">{rfp.title}</Link> },
    { key: 'buyerName', label: '구매사', render: (rfp) => <Link href={`/buyers/${rfp.buyerWsId}`} className="text-on-surface hover:underline">{rfp.buyerName}</Link> },
    { key: 'status', label: '상태', render: (rfp) => <AdminStatusBadge status={rfp.status} /> },
    { key: 'deadline', label: '마감', render: (rfp) => <span className="md-numeric text-label-small text-on-surface-variant">{formatDateKST(rfp.deadline)}</span> },
  ];

  return (
    <div className="space-y-4">
      <AdminPageHeader title="RFP 전체 목록" />
      <RfpViewTabs current="rfps" />
      <AdminListControls path="/rfps" params={params} statusLabel="RFP 상태별 보기" statusViews={[{ value: '', label: '전체' }, { value: 'draft', label: '초안' }, { value: 'sent', label: '발송' }, { value: 'closed', label: '마감' }, { value: 'cancelled', label: '취소' }, { value: 'awarded', label: '낙찰' }]} sortOptions={[{ value: 'deadline', label: '마감 임박순' }]} dateLabel="마감일">
        <input
          name="q"
          aria-label="RFP 제목 또는 코드 검색"
          defaultValue={q ?? ''}
          placeholder="제목 또는 코드 검색"
          className="rounded border border-outline-variant px-3 py-1.5 text-body-small bg-surface focus:outline-none focus:ring-1 focus:ring-primary w-64"
        />
      </AdminListControls>
      <AdminDataTable caption="RFP 목록" rows={rfpList} columns={columns} getKey={(rfp) => rfp.id} emptyMessage={filtered ? '검색 조건에 맞는 RFP가 없습니다.' : status ? '이 상태의 RFP가 없습니다.' : '등록된 RFP가 없습니다.'} emptyAction={filtered ? { label: '필터 초기화', href: clearedListHref('/rfps', params) } : undefined} />
      <AdminListPagination path="/rfps" params={params} page={page} total={total} />
    </div>
  );
}
