import { cache } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AdminPageHeader } from '@/components/AdminPageHeader';
import { CopyableValue } from '@/components/CopyableValue';
import { AdminDataTable, type AdminTableColumn } from '@/components/AdminDataTable';
import Link from 'next/link';
import { getUserDetail } from '@/lib/server/queries/admin/users';
import { AdminStatusBadge } from '@/components/AdminStatusBadge';
import { ConfirmButton } from '@/components/ConfirmButton';
import { SubmitButton } from '@/components/SubmitButton';
import { suspendUserAction } from '@/lib/server/actions/admin/suspendUserAction';
import { unsuspendUserAction } from '@/lib/server/actions/admin/unsuspendUserAction';
import { deleteUserAction } from '@/lib/server/actions/admin/deleteUserAction';
import { formatDateKST } from '@/lib/utils';
import { removeWorkspaceMemberAction } from '@/lib/server/actions/admin/removeWorkspaceMemberAction';
import { ActionForm } from '@/components/ActionForm';
import { toActionState, type ActionState } from '@/lib/action-state';
import { requireAdminSession } from '@/lib/auth/admin-session';
import { hasPermission } from '@/lib/auth/permissions';
import { listEntityAuditLogs } from '@/lib/server/queries/admin/audit-log';
import { getUserDeletionImpact } from '@/lib/server/queries/admin/deletion-impact';
import { AdminAuditHistory } from '@/components/AdminAuditHistory';
import { DangerousDeleteForm } from '@/components/DangerousDeleteForm';
import { safeListReturnTo } from '@/lib/admin-return-to';

// generateMetadata 와 본문이 같은 조회를 한 번만 하도록 요청 단위로 캐시한다.
const loadUser = cache((id: string) => getUserDetail(id));

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const detail = await loadUser((await params).id);
  return { title: detail ? detail.user.name : '회원' };
}

type Membership = NonNullable<Awaited<ReturnType<typeof getUserDetail>>>['memberships'][number];

export default async function UserDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const { id } = await params;
  const returnTo = safeListReturnTo((await searchParams).returnTo, '/users');
  const [detail, session, history] = await Promise.all([loadUser(id), requireAdminSession(), listEntityAuditLogs('user', id)]);
  if (!detail) notFound();

  const { user, memberships } = detail;
  const isSuspended = user.status === 'suspended';
  const isDeleted = user.deletedAt != null;
  const canManageUser = hasPermission(session, 'user.manage');
  const canManageWorkspace = hasPermission(session, 'workspace.manage');
  const canDelete = hasPermission(session, 'user.delete');
  const impact = canDelete ? await getUserDeletionImpact(id) : [];

  async function doSuspend() {
    'use server';
    return toActionState(await suspendUserAction(user.id), '계정을 정지했습니다.');
  }

  async function doUnsuspend(): Promise<ActionState> {
    'use server';
    return toActionState(await unsuspendUserAction(user.id), '계정을 활성화했습니다.');
  }

  async function doDelete(_previous: ActionState, formData: FormData): Promise<ActionState> {
    'use server';
    return deleteUserAction(user.id, String(formData.get('confirmationName') ?? ''), returnTo);
  }

  const membershipColumns: AdminTableColumn<Membership>[] = [
    { key: 'workspace', label: '워크스페이스', render: (m) => <Link href={`${m.workspaceType === 'buyer' ? '/buyers' : '/sellers'}/${m.workspaceId}`} className="text-primary hover:underline">{m.workspaceName}</Link> },
    { key: 'type', label: '유형', cellClassName: 'text-label-small text-on-surface-variant', render: (m) => (m.workspaceType === 'buyer' ? '구매사' : 'PG사') },
    { key: 'role', label: '역할', cellClassName: 'text-label-small', render: (m) => (m.role === 'admin' ? '관리자' : '멤버') },
    { key: 'joinedAt', label: '가입일', cellClassName: 'md-numeric text-label-small text-on-surface-variant', render: (m) => formatDateKST(m.joinedAt) },
    {
      key: 'actions', label: '관리', hideLabel: true, align: 'right',
      render: (m) => {
        if (!canManageWorkspace) return null;
        async function doRemove() {
          'use server';
          return toActionState(await removeWorkspaceMemberAction(m.workspaceId, user.id), '멤버를 제외했습니다.');
        }
        return (
          <>
            <ConfirmButton
              action={doRemove}
              label="제외"
              confirmMessage="이 멤버를 제외하시겠습니까?"
              confirmLabel="제외"
              labelClassName="text-label-small text-error hover:underline disabled:opacity-40 disabled:cursor-not-allowed"
              confirmClassName="text-label-small text-error hover:underline"
              disabled={m.isLastAdmin}
            />
            {m.isLastAdmin && <span className="ml-2 text-label-small text-on-surface-variant">마지막 관리자는 제외할 수 없습니다.</span>}
          </>
        );
      },
    },
  ];

  return (
    <div className="space-y-6 max-w-4xl">
      <AdminPageHeader
        title={user.name}
        breadcrumbs={[{ label: '회원', href: returnTo }]}
        badges={<AdminStatusBadge status={isDeleted ? 'deleted' : user.status} />}
        meta={<span>회원 ID <CopyableValue value={user.id} label="회원 ID" numeric /></span>}
      />

      <section className="rounded border border-outline-variant divide-y divide-outline-variant">
        <div className="px-4 py-3 flex gap-4">
          <span className="text-label-small text-on-surface-variant w-32 shrink-0">이메일</span>
          <span className="text-body-small"><CopyableValue value={user.email} label="이메일" /></span>
        </div>
        {user.phone && (
          <div className="px-4 py-3 flex gap-4">
            <span className="text-label-small text-on-surface-variant w-32 shrink-0">전화번호</span>
            <span className="text-body-small md-numeric">{user.phone}</span>
          </div>
        )}
        <div className="px-4 py-3 flex gap-4">
          <span className="text-label-small text-on-surface-variant w-32 shrink-0">가입일</span>
          <span className="text-body-small md-numeric">
            {formatDateKST(user.createdAt)}
          </span>
        </div>
      </section>

      {canManageUser && !isDeleted && <section>
        <h2 className="text-title-small font-semibold mb-3">계정 상태</h2>
        {isSuspended ? (
          <ActionForm action={doUnsuspend} className="space-y-2">
            <SubmitButton className="rounded border border-primary text-primary px-4 py-2 text-label-small hover:bg-primary/10">
              계정 활성화
            </SubmitButton>
          </ActionForm>
        ) : (
          <ConfirmButton
            action={doSuspend}
            label="계정 정지"
            confirmMessage="이 계정을 정지하시겠습니까?"
            confirmLabel="정지"
            labelClassName="rounded border border-error text-error px-4 py-2 text-label-small hover:bg-error/10"
            confirmClassName="rounded border border-error text-error px-3 py-1.5 text-label-small hover:bg-error/10"
          />
        )}
      </section>}

      <section>
        <h2 className="text-title-small font-semibold mb-3">
          소속 워크스페이스 ({memberships.length})
        </h2>
        <AdminDataTable caption="소속 워크스페이스" rows={memberships} columns={membershipColumns} getKey={(m) => m.workspaceId} emptyMessage="소속 워크스페이스 없음" hoverRows={false} />
      </section>

      <AdminAuditHistory logs={history} entityType="user" entityId={user.id} />
      {canDelete && <DangerousDeleteForm name={user.name} label="회원" impact={impact} action={doDelete} />}
    </div>
  );
}
