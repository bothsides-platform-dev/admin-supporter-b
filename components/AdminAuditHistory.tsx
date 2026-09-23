import Link from 'next/link';
import { formatKST } from '@/lib/utils';
import type { AuditLogRow } from '@/lib/server/queries/admin/audit-log';
import { AdminStatusBadge } from './AdminStatusBadge';

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  'workspace.approve': '워크스페이스 승인', 'workspace.reject': '워크스페이스 반려',
  'workspace.request_more_info': '보완 요청', 'workspace.member.remove': '멤버 제외',
  'workspace.hard_delete': '워크스페이스 영구 삭제', 'workspace.grade_update': '영중소구간 변경',
  'workspace.name_change_approve': '이름 변경 승인', 'workspace.name_change_reject': '이름 변경 반려',
  'workspace.needs_more_info': '보완 요청',
  'workspace.suspend': '워크스페이스 정지', 'workspace.unsuspend': '워크스페이스 활성화',
  'user.suspend': '회원 정지', 'user.unsuspend': '회원 활성화', 'user.hard_delete': '회원 영구 삭제',
  'note.create': '어드민 노트 추가', 'note.delete': '어드민 노트 삭제',
  'reminder.send': '리마인더 발송', 'bid.hide': '입찰 철회',
  'rfp.extend': '마감 연장', 'pg_matching.policy_save': 'PG 매칭 정책 저장',
  'agreement_rates.saved': '수수료 기준 변경',
  'membership.approve': '멤버 승인', 'membership.reject': '멤버 반려',
  'pg_recommendation.group_save': 'PG 추천 그룹 저장', 'pg_recommendation.group_delete': 'PG 추천 그룹 삭제',
  'workspace.grade.update': '영중소구간 변경', 'rfp.extend_deadline': '마감 연장',
  'rfp.reminder.send': '리마인더 발송', 'bid.withdraw': '입찰 철회',
  'agreement_rates.update': '수수료 기준 변경',
};

export const AUDIT_ENTITY_LABELS: Record<string, string> = {
  workspace: '워크스페이스', user: '회원', admin_note: '노트', note: '노트',
  rfp: 'RFP', bid: '입찰', verification_application: '심사 신청',
  workspace_member: '워크스페이스 멤버', pg_agreement_rates: '수수료 기준',
  pg_recommendation_group: 'PG 추천 그룹',
};

export function auditEntityHref(log: AuditLogRow, workspaceType?: 'buyer' | 'pg' | null, bidRfpId?: string | null): string | null {
  switch (log.entityType) {
    case 'user': return `/users/${log.entityId}`;
    case 'rfp': return `/rfps/${log.entityId}`;
    case 'verification_application': return `/review/${log.entityId}`;
    case 'workspace': case 'workspace_member': case 'pg_agreement_rates': return workspaceType === 'buyer' ? `/buyers/${log.entityId}` : workspaceType === 'pg' ? `/sellers/${log.entityId}` : null;
    case 'bid': return bidRfpId ? `/rfps/${bidRfpId}` : null;
    case 'pg_recommendation_group': return '/pg-recommendations';
    default: return null;
  }
}

const FIELD_LABELS: Record<string, string> = {
  status: '상태', workspaceStatus: '워크스페이스 상태', approvalStatus: '승인 상태',
  grade: '영중소구간', name: '이름', reason: '사유', deadline: '마감일',
  body: '내용', userId: '회원 ID', workspaceId: '워크스페이스 ID',
  email: '이메일', type: '유형', days: '연장 일수', oldDeadline: '기존 마감일',
  newDeadline: '새 마감일',
};
const GRADE_LABELS: Record<string, string> = {
  sole: '영세', small: '중소 1', medium: '중소 2', large: '중소 3', general: '일반',
};

function fieldValue(key: string, value: unknown) {
  if (value == null) return '없음';
  if (typeof value === 'boolean') return value ? '예' : '아니요';
  if (typeof value === 'object') return <details><summary className="cursor-pointer text-primary">상세 데이터</summary><pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-all rounded bg-surface-container-low p-2">{JSON.stringify(value, null, 2)}</pre></details>;
  if (['status', 'workspaceStatus', 'approvalStatus'].includes(key)) return <AdminStatusBadge status={String(value)} />;
  if (key === 'grade') return GRADE_LABELS[String(value)] ?? String(value);
  if (/deadline|at$/i.test(key) && typeof value === 'string') {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return formatKST(date);
  }
  return String(value);
}

function Payload({ value }: { value: unknown }) {
  if (value == null || (typeof value === 'object' && Object.keys(value).length === 0)) return <span>없음</span>;
  if (typeof value !== 'object' || Array.isArray(value)) return <span>{fieldValue('value', value)}</span>;
  return <dl className="mt-1 grid gap-x-3 gap-y-1 rounded bg-surface-container-low p-2 sm:grid-cols-[auto_1fr]">{Object.entries(value).map(([key, item]) => <div key={key} className="contents"><dt className="font-medium">{FIELD_LABELS[key] ?? key}</dt><dd className="break-all">{fieldValue(key, item)}</dd></div>)}</dl>;
}

export function AuditLogDetails({ log }: { log: AuditLogRow }) {
  const payload = log.payloadJson;
  if (!payload || Object.keys(payload).length === 0) return null;
  const extras = Object.fromEntries(Object.entries(payload).filter(([key]) => !['before', 'after', 'reason'].includes(key)));
  return (
    <details className="mt-1 text-label-small text-on-surface-variant">
      <summary className="cursor-pointer text-primary">변경 내용 보기</summary>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {payload.before !== undefined && <div><strong>변경 전</strong><Payload value={payload.before} /></div>}
        {payload.after !== undefined && <div><strong>변경 후</strong><Payload value={payload.after} /></div>}
        {payload.reason && <div className="sm:col-span-2"><strong>처리 사유</strong><p className="mt-1 whitespace-pre-wrap">{payload.reason}</p></div>}
        {Object.keys(extras).length > 0 && <div className="sm:col-span-2"><strong>추가 정보</strong><Payload value={extras} /></div>}
      </div>
    </details>
  );
}

export function AdminAuditHistory({ logs, entityType, entityId, workspaceId }: { logs: AuditLogRow[]; entityType: string; entityId: string; workspaceId?: string }) {
  const allHref = workspaceId ? `/audit-log?workspaceId=${encodeURIComponent(workspaceId)}` : `/audit-log?entityType=${encodeURIComponent(entityType)}&entityId=${encodeURIComponent(entityId)}`;
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between"><h2 className="text-title-small font-semibold">변경 이력</h2><Link href={allHref} className="text-label-small text-primary hover:underline">전체 이력 보기</Link></div>
      {logs.length === 0 ? <p className="rounded border border-outline-variant p-4 text-body-small text-on-surface-variant">기록된 변경 이력이 없습니다.</p> :
        <ol className="divide-y divide-outline-variant rounded border border-outline-variant">
          {logs.map((log) => <li key={log.id} className="p-4 text-body-small">
            <div className="flex flex-wrap items-center justify-between gap-2"><strong>{AUDIT_ACTION_LABELS[log.action] ?? log.action}</strong><time className="md-numeric text-label-small text-on-surface-variant">{formatKST(log.occurredAt)}</time></div>
            <p className="mt-1 text-label-small text-on-surface-variant">처리자: {log.actor}</p>
            <AuditLogDetails log={log} />
          </li>)}
        </ol>}
    </section>
  );
}
