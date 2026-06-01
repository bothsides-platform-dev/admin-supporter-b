import { listAuditLogs } from '@/lib/server/queries/admin/audit-log';
import Link from 'next/link';

const ACTION_LABELS: Record<string, string> = {
  'workspace.approve': '워크스페이스 승인',
  'workspace.reject': '워크스페이스 반려',
  'workspace.request_more_info': '보완 요청',
  'workspace.member.remove': '멤버 제외',
  'user.suspend': '회원 정지',
  'user.unsuspend': '회원 활성화',
  'note.create': '어드민 노트 추가',
  'note.delete': '어드민 노트 삭제',
  'rfp.reminder.send': '리마인더 발송',
  'bid.withdraw': '입찰 철회',
  'rfp.extend_deadline': '마감 연장',
};

const ENTITY_TYPE_LABELS: Record<string, string> = {
  workspace: '워크스페이스',
  user: '회원',
  note: '노트',
  rfp: 'RFP',
  bid: '입찰',
};

function entityHref(entityType: string, entityId: string): string | null {
  switch (entityType) {
    case 'user': return `/users/${entityId}`;
    case 'rfp': return `/rfps/${entityId}`;
    default: return null;
  }
}

export default async function AuditLogPage() {
  const logs = await listAuditLogs(200);

  return (
    <div className="space-y-4">
      <h1 className="text-headline-small font-semibold">감사 로그</h1>
      <div className="rounded border border-outline-variant overflow-hidden">
        <table className="w-full text-body-small">
          <thead>
            <tr className="border-b border-outline-variant bg-surface-container-low">
              <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium">시각</th>
              <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium">액션</th>
              <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium">대상</th>
              <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium">처리자</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => {
              const href = entityHref(log.entityType, log.entityId);
              return (
                <tr
                  key={log.id}
                  className="border-b border-outline-variant last:border-0 hover:bg-surface-container-low"
                >
                  <td className="px-4 py-3 md-numeric text-label-small text-on-surface-variant whitespace-nowrap">
                    {new Date(log.occurredAt).toLocaleString('ko-KR')}
                  </td>
                  <td className="px-4 py-3 text-label-small">
                    {ACTION_LABELS[log.action] ?? log.action}
                  </td>
                  <td className="px-4 py-3 text-label-small text-on-surface-variant">
                    <span>{ENTITY_TYPE_LABELS[log.entityType] ?? log.entityType}</span>
                    {href ? (
                      <Link href={href} className="ml-2 md-numeric text-primary hover:underline">
                        {log.entityId.slice(0, 8)}&hellip;
                      </Link>
                    ) : (
                      <span className="ml-2 md-numeric">{log.entityId.slice(0, 8)}&hellip;</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-label-small text-on-surface-variant">{log.actor}</td>
                </tr>
              );
            })}
            {logs.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-on-surface-variant">
                  감사 로그가 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
