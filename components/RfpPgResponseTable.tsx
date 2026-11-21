import Link from 'next/link';
import { AdminDataTable, type AdminTableColumn } from '@/components/AdminDataTable';
import { Chip } from '@/components/primitives/Chip';
import type { RfpPgResponseRow } from '@/lib/server/queries/admin/rfps';
import { formatKST } from '@/lib/utils';

function timestamp(value: Date | null) {
  return value ? <time dateTime={value.toISOString()}>{formatKST(value)}</time> : '기록 없음';
}

const timeCell = 'whitespace-nowrap md-numeric text-label-small text-on-surface-variant';

const columns: AdminTableColumn<RfpPgResponseRow>[] = [
  {
    key: 'pg', label: 'PG사',
    render: (row) => (
      <Link id={`pg-response-${row.pgWsId}`} href={`/sellers/${row.pgWsId}`} className="scroll-mt-4 text-primary hover:underline target:underline">
        {row.pgWsName}
      </Link>
    ),
  },
  {
    key: 'response', label: '응답 상태', cellClassName: 'whitespace-nowrap',
    render: ({ latestBid, openedAt }) => {
      if (!latestBid) {
        return <Chip color={openedAt ? 'primary' : 'surface'} label={openedAt ? '열람 후 미제출' : '열람 기록 없음'} />;
      }
      const withdrawn = latestBid.status === 'withdrawn';
      return <Chip color={withdrawn ? 'error' : 'tertiary'} label={`${latestBid.round}차 견적 ${withdrawn ? '철회' : '제출'}`} />;
    },
  },
  { key: 'sentAt', label: '초대 발송', cellClassName: timeCell, render: (row) => timestamp(row.sentAt) },
  { key: 'openedAt', label: '초대 열람', cellClassName: timeCell, render: (row) => timestamp(row.openedAt) },
];

export function RfpPgResponseTable({ rows, overviewHref = '/pg-status' }: { rows: RfpPgResponseRow[]; overviewHref?: string }) {
  const respondedCount = rows.filter((row) => row.latestBid !== null).length;

  return (
    <section id="pg-responses" aria-labelledby="pg-responses-heading" className="scroll-mt-4 space-y-3">
      <div className="space-y-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="pg-responses-heading" className="text-title-small font-semibold">PG사별 응답 현황</h2>
          <Link href={overviewHref} className="text-label-small text-primary hover:underline">전체 RFP의 PG사별 현황</Link>
        </div>
        {rows.length > 0 && (
          <p className="text-body-small text-on-surface-variant">
            초대 {rows.length}곳 · 견적 제출 이력 {respondedCount}곳 (철회 포함)
          </p>
        )}
      </div>
      <AdminDataTable
        caption="초대한 PG사별 응답 현황"
        rows={rows}
        columns={columns}
        getKey={(row) => row.pgWsId}
        emptyMessage="발송된 PG사 초대가 없습니다."
      />
    </section>
  );
}
