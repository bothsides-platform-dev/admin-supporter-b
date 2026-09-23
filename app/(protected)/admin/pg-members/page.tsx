import { listPgMembersPage } from '@/lib/server/queries/admin/pgMembers';
import { AdminListControls } from '@/components/AdminListControls';
import { AdminListPagination } from '@/components/AdminListPagination';
import { AdminDataTable, type AdminTableColumn } from '@/components/AdminDataTable';
import type { PgMemberRow } from '@/lib/server/queries/admin/pgMembers';
import { type ListParams } from '@/lib/admin-list';
import { requireAdminSession } from '@/lib/auth/admin-session';
import { hasPermission } from '@/lib/auth/permissions';
import { approveMemberAction } from '@/lib/server/actions/admin/approveMemberAction';
import { rejectMemberAction } from '@/lib/server/actions/admin/rejectMemberAction';
import { AdminStatusBadge } from '@/components/AdminStatusBadge';
import { ConfirmButton } from '@/components/ConfirmButton';
import { toActionState } from '@/lib/action-state';
import { formatKST } from '@/lib/utils';

export default async function PgMembersPage({
  searchParams,
}: {
  searchParams: Promise<ListParams>;
}) {
  const params = await searchParams;
  const { status } = params;
  const { rows: members, total, page } = await listPgMembersPage(params);
  const canReview = hasPermission(await requireAdminSession(), 'workspace.review');
  const filtered = Boolean(status && status !== 'all' && status !== 'pending_approval' || params.q || params.from || params.to);
  const columns: AdminTableColumn<PgMemberRow>[] = [
    { key: 'name', label: '담당자', render: (m) => <><div>{m.name}</div><div className="text-label-small text-on-surface-variant">{m.email}</div></> },
    { key: 'workspace', label: '워크스페이스', render: (m) => m.workspaceName },
    { key: 'joinedAt', label: '합류일', render: (m) => <span className="md-numeric text-on-surface-variant">{formatKST(m.joinedAt)}</span> },
    { key: 'status', label: '상태', render: (m) => <AdminStatusBadge status={m.approvalStatus} /> },
    { key: 'action', label: '처리', render: (m) => {
      if (!canReview || m.approvalStatus !== 'pending_approval') return null;
      async function doApprove() {
        'use server';
        return toActionState(await approveMemberAction(undefined, m.workspaceId, m.userId), '담당자를 승인했습니다.');
      }
      async function doReject() {
        'use server';
        return toActionState(await rejectMemberAction(undefined, m.workspaceId, m.userId), '담당자를 거부했습니다.');
      }
      return <div className="flex items-center gap-3">
        <ConfirmButton action={doApprove} label="승인" confirmMessage="이 담당자를 승인하시겠습니까?" confirmLabel="승인" labelClassName="text-label-small text-primary hover:underline" confirmClassName="text-label-small text-primary hover:underline" />
        <ConfirmButton action={doReject} label="거부" confirmMessage="이 담당자를 거부하시겠습니까?" confirmLabel="거부" labelClassName="text-label-small text-error hover:underline" confirmClassName="text-label-small text-error hover:underline" />
      </div>;
    } },
  ];

  return (
    <div className="space-y-4">
      <h1 className="text-headline-small font-semibold">PG 담당자 승인</h1>
      <AdminListControls path="/admin/pg-members" params={params} sortOptions={[{ value: 'name', label: '이름순' }]} dateLabel="합류일">
        <input name="q" defaultValue={params.q ?? ''} placeholder="담당자·회사 검색" aria-label="담당자 또는 회사 검색" className="rounded border border-outline-variant bg-surface px-3 py-1.5 text-body-small" />
        <select
          name="status"
          aria-label="PG 담당자 승인 상태"
          defaultValue={status === 'pending' ? '' : status ?? ''}
          className="rounded border border-outline-variant px-3 py-1.5 text-body-small bg-surface"
        >
          <option value="">승인 대기</option>
          <option value="approved">승인됨</option>
          <option value="rejected">거부됨</option>
          <option value="all">전체</option>
        </select>
      </AdminListControls>
      <AdminDataTable caption="PG 담당자 목록" rows={members} columns={columns} getKey={(m) => `${m.workspaceId}:${m.userId}`} emptyMessage={filtered ? '검색 조건에 맞는 담당자가 없습니다.' : '승인 대기 중인 담당자가 없습니다.'} />
      <AdminListPagination path="/admin/pg-members" params={params} page={page} total={total} />
    </div>
  );
}
