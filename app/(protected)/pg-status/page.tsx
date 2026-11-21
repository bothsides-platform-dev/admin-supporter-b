import Link from 'next/link';
import { AdminDataTable, type AdminTableColumn } from '@/components/AdminDataTable';
import { AdminListControls } from '@/components/AdminListControls';
import { AdminListPagination } from '@/components/AdminListPagination';
import { AdminPageHeader } from '@/components/AdminPageHeader';
import { RfpViewTabs } from '@/components/RfpViewTabs';
import { clearedListHref, listQuery } from '@/lib/admin-list';
import { listPgStatusPage, type PgStatusRow } from '@/lib/server/queries/admin/pgStatus';
import { formatDateKST, formatKST } from '@/lib/utils';

export const metadata = { title: 'PG사별 현황' };

const columnsFor = (returnTo: string): AdminTableColumn<PgStatusRow>[] => [
  {
    key: 'name', label: 'PG사',
    render: (row) => <Link href={{ pathname: `/sellers/${row.id}`, query: { returnTo } }} className="text-primary hover:underline">{row.name}</Link>,
  },
  { key: 'invited', label: '받은 RFP', align: 'right', cellClassName: 'md-numeric', render: (row) => row.invited },
  { key: 'unopened', label: '미제출 · 열람 기록 없음', align: 'right', cellClassName: 'md-numeric', render: (row) => row.unopened },
  { key: 'openedWithoutBid', label: '열람 후 미제출', align: 'right', cellClassName: 'md-numeric', render: (row) => row.openedWithoutBid },
  { key: 'submitted', label: '견적 제출', align: 'right', cellClassName: 'md-numeric', render: (row) => row.submitted },
  { key: 'withdrawn', label: '견적 철회', align: 'right', cellClassName: 'md-numeric', render: (row) => row.withdrawn },
  {
    key: 'nextRfp', label: '마감이 가까운 미제출 RFP',
    render: ({ id, nextRfp }) => nextRfp ? (
      <div className="space-y-1">
        <Link href={{ pathname: `/rfps/${nextRfp.id}`, query: { returnTo }, hash: `pg-response-${id}` }} className="text-primary hover:underline">
          {nextRfp.title}
        </Link>
        <time dateTime={nextRfp.deadline.toISOString()} className="block whitespace-nowrap text-label-small text-on-surface-variant">
          {formatKST(nextRfp.deadline)} 마감
        </time>
      </div>
    ) : '없음',
  },
  {
    key: 'lastSentAt', label: '최근 초대일', cellClassName: 'whitespace-nowrap md-numeric',
    render: ({ lastSentAt }) => lastSentAt
      ? <time dateTime={lastSentAt.toISOString()}>{formatDateKST(lastSentAt)}</time>
      : '없음',
  },
];

type SearchParams = Partial<Record<'q' | 'from' | 'to' | 'sort' | 'page', string | string[]>>;
function first(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function PgStatusPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { q, from, to, sort, page } = await searchParams;
  const filters = { q: first(q), from: first(from), to: first(to), sort: first(sort), page: first(page) };
  const result = await listPgStatusPage(filters);
  const params = { ...filters, sort: result.sort, page: result.page > 1 ? String(result.page) : undefined };
  const returnTo = `/pg-status?${listQuery(params)}`;

  return (
    <div className="space-y-4">
      <AdminPageHeader title="PG사별 현황" description="발송한 초대를 기준으로 집계합니다. 견적을 여러 번 낸 RFP는 마지막 제출 회차의 상태로 한 번만 셉니다." />
      <RfpViewTabs current="pg-status" />
      <AdminListControls path="/pg-status" params={params} dateLabel="초대 발송일" sortOptions={[
        { value: 'deadline', label: '미제출 RFP 마감 임박순' }, { value: 'name', label: 'PG사명순' },
      ]}>
        <label className="flex flex-col gap-1 text-label-small text-on-surface-variant">
          PG사명
          <input name="q" type="search" defaultValue={params.q} className="rounded border border-outline-variant bg-surface px-3 py-1.5 text-body-small" />
        </label>
      </AdminListControls>
      <AdminDataTable caption="PG사별 RFP 응답 현황" rows={result.rows} columns={columnsFor(returnTo)} getKey={(row) => row.id}
        emptyMessage={params.q ? '검색한 이름과 일치하는 PG사가 없습니다.' : '등록된 PG사가 없습니다.'}
        emptyAction={params.q ? { label: '필터 초기화', href: clearedListHref('/pg-status', params) } : undefined}
      />
      <AdminListPagination path="/pg-status" params={params} page={result.page} total={result.total} />
    </div>
  );
}
