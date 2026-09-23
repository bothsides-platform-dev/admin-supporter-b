import Link from 'next/link';
import { listAuditLogs, type AuditFilters } from '@/lib/server/queries/admin/audit-log';
import { formatKST } from '@/lib/utils';
import { AUDIT_ACTION_LABELS, AUDIT_ENTITY_LABELS, AuditLogDetails, auditEntityHref } from '@/components/AdminAuditHistory';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const single = (value: string | string[] | undefined) => typeof value === 'string' ? value : '';

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

  return (
    <div className="space-y-4">
      <h1 className="text-headline-small font-semibold">감사 로그</h1>
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
      <p className="text-label-small text-on-surface-variant">전체 {total}건 · {total ? (page - 1) * pageSize + 1 : 0}–{Math.min(page * pageSize, total)}건 표시</p>
      {error && <p role="alert" className="text-body-small text-error">{error}</p>}
      <div className="overflow-x-auto rounded border border-outline-variant">
        <table className="w-full text-body-small">
          <thead><tr className="border-b border-outline-variant bg-surface-container-low"><th className="px-4 py-2 text-left">시각</th><th className="px-4 py-2 text-left">작업 및 변경 내용</th><th className="px-4 py-2 text-left">대상</th><th className="px-4 py-2 text-left">처리자</th></tr></thead>
          <tbody>{rows.map(({ log, workspaceType, bidRfpId }) => {
            const href = auditEntityHref(log, workspaceType, bidRfpId);
            return <tr key={log.id} className="border-b border-outline-variant last:border-0 align-top"><td className="whitespace-nowrap px-4 py-3 text-label-small text-on-surface-variant md-numeric">{formatKST(log.occurredAt)}</td><td className="min-w-56 px-4 py-3"><span className="font-medium">{AUDIT_ACTION_LABELS[log.action] ?? log.action}</span><AuditLogDetails log={log} /></td><td className="px-4 py-3 text-label-small text-on-surface-variant"><span>{AUDIT_ENTITY_LABELS[log.entityType] ?? log.entityType}</span>{href ? <Link href={href} className="ml-2 text-primary hover:underline md-numeric">{log.entityId.slice(0, 8)}…</Link> : <span className="ml-2 md-numeric">{log.entityId.slice(0, 8)}…</span>}</td><td className="px-4 py-3 text-label-small text-on-surface-variant">{log.actor}</td></tr>;
          })}{rows.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-on-surface-variant">조건에 맞는 감사 로그가 없습니다.</td></tr>}</tbody>
        </table>
      </div>
      <nav className="flex items-center justify-end gap-3 text-label-small" aria-label="감사 로그 페이지"><span>{page} / {Math.max(1, Math.ceil(total / pageSize))} 페이지</span>{page > 1 && <Link href={pageHref(page - 1)} className="rounded border border-outline-variant px-3 py-2">이전</Link>}{page * pageSize < total && <Link href={pageHref(page + 1)} className="rounded border border-outline-variant px-3 py-2">다음</Link>}</nav>
    </div>
  );
}
