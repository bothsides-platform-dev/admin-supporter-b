import { AdminPageHeader } from '@/components/AdminPageHeader';
import { CopyableValue } from '@/components/CopyableValue';
import { AdminDataTable, type AdminTableColumn } from '@/components/AdminDataTable';
import { AdminListPagination } from '@/components/AdminListPagination';
import Link from 'next/link';
import { listAuditLogs, type AuditFilters } from '@/lib/server/queries/admin/audit-log';
import { formatKST } from '@/lib/utils';
import { AUDIT_ACTION_LABELS, AUDIT_ENTITY_LABELS, AuditLogDetails, auditEntityHref } from '@/components/AdminAuditHistory';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const single = (value: string | string[] | undefined) => typeof value === 'string' ? value : '';

export const metadata = { title: '감사 로그' };

export default async function AuditLogPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const filters: AuditFilters = {
    page: Number(single(params.page)) || 1,
    actor: single(params.actor).slice(0, 100),
    entityType: single(params.entityType).slice(0, 100),
    entityId: single(params.entityId).slice(0, 100),
    workspaceId: single(params.workspaceId).slice(0, 100),
    action: single(params.action).slice(0, 100),
    from: single(params.from), to: single(params.to),
  };
  const { rows, total, page, pageSize, error } = await listAuditLogs(filters);
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) if (key !== 'page' && value) query.set(key, String(value));
  const pageHref = (number: number) => `/audit-log?${new URLSearchParams([...query, ['page', String(number)]]).toString()}`;

  const columns: AdminTableColumn<(typeof rows)[number]>[] = [
    { key: 'occurredAt', label: '시각', cellClassName: 'whitespace-nowrap text-label-small text-on-surface-variant md-numeric', render: ({ log }) => formatKST(log.occurredAt) },
    { key: 'action', label: '작업 및 변경 내용', cellClassName: 'min-w-56', render: ({ log }) => <><span className="font-medium">{AUDIT_ACTION_LABELS[log.action] ?? log.action}</span><AuditLogDetails log={log} /></> },
    {
      key: 'entity', label: '대상', cellClassName: 'text-label-small text-on-surface-variant',
      render: ({ log, workspaceType, bidRfpId }) => {
        const href = auditEntityHref(log, workspaceType, bidRfpId);
        return <><span>{AUDIT_ENTITY_LABELS[log.entityType] ?? log.entityType}</span>{href && <Link href={href} className="ml-2 text-primary hover:underline">열기</Link>}<CopyableValue value={log.entityId} display={`${log.entityId.slice(0, 8)}…`} label="대상 ID" numeric className="ml-2" /></>;
      },
    },
    { key: 'actor', label: '처리자', cellClassName: 'text-label-small text-on-surface-variant', render: ({ log }) => log.actor },
  ];

  return (
    <div className="space-y-4">
      <AdminPageHeader title="감사 로그" />
      <form method="get" className="grid gap-3 rounded border border-outline-variant p-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-label-small text-on-surface-variant">처리자<input name="actor" defaultValue={filters.actor} placeholder="처리자 검색" className="mt-1 w-full rounded border border-outline-variant bg-surface px-3 py-2 text-body-small text-on-surface" /></label>
        <label className="text-label-small text-on-surface-variant">대상 유형<select name="entityType" defaultValue={filters.entityType} className="mt-1 w-full rounded border border-outline-variant bg-surface px-3 py-2 text-body-small text-on-surface"><option value="">전체</option>{Object.entries(AUDIT_ENTITY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className="text-label-small text-on-surface-variant">대상 ID<input name="entityId" defaultValue={filters.entityId} placeholder="UUID" className="mt-1 w-full rounded border border-outline-variant bg-surface px-3 py-2 text-body-small text-on-surface" /></label>
        <label className="text-label-small text-on-surface-variant">워크스페이스 ID<input name="workspaceId" defaultValue={filters.workspaceId} placeholder="관련 심사 포함" className="mt-1 w-full rounded border border-outline-variant bg-surface px-3 py-2 text-body-small text-on-surface" /></label>
        <label className="text-label-small text-on-surface-variant">작업<select name="action" defaultValue={filters.action} className="mt-1 w-full rounded border border-outline-variant bg-surface px-3 py-2 text-body-small text-on-surface"><option value="">전체</option>{filters.action && !(filters.action in AUDIT_ACTION_LABELS) && <option value={filters.action}>{filters.action}</option>}{Object.entries(AUDIT_ACTION_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className="text-label-small text-on-surface-variant">시작일<input type="date" name="from" defaultValue={filters.from} className="mt-1 w-full rounded border border-outline-variant bg-surface px-3 py-2 text-body-small text-on-surface" /></label>
        <label className="text-label-small text-on-surface-variant">종료일<input type="date" name="to" defaultValue={filters.to} className="mt-1 w-full rounded border border-outline-variant bg-surface px-3 py-2 text-body-small text-on-surface" /></label>
        <div className="flex items-end gap-2 sm:col-span-2"><button className="rounded bg-primary px-4 py-2 text-label-small text-on-primary">검색</button><Link href="/audit-log" className="rounded border border-outline-variant px-4 py-2 text-label-small">초기화</Link></div>
      </form>
      {error && <p role="alert" className="text-body-small text-error">{error}</p>}
      <AdminDataTable caption="감사 로그" rows={rows} columns={columns} getKey={({ log }) => log.id} emptyMessage="조건에 맞는 감사 로그가 없습니다." rowClassName="align-top" hoverRows={false} />
      <AdminListPagination path="/audit-log" page={page} total={total} pageSize={pageSize} hrefFor={pageHref} />
    </div>
  );
}
