import { notFound } from 'next/navigation';
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

export default async function UserDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const { id } = await params;
  const returnTo = safeListReturnTo((await searchParams).returnTo, '/users');
  const [detail, session, history] = await Promise.all([getUserDetail(id), requireAdminSession(), listEntityAuditLogs('user', id)]);
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

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="space-y-1">
        <Link href={returnTo} className="text-on-surface-variant hover:text-on-surface text-body-small">
          ← 목록
        </Link>
        <div className="flex items-center gap-3">
          <h1 className="text-headline-small font-semibold">{user.name}</h1>
          {isDeleted ? (
            <AdminStatusBadge status="deleted" />
          ) : (
            <AdminStatusBadge status={user.status} />
          )}
        </div>
      </div>

      <section className="rounded border border-outline-variant divide-y divide-outline-variant">
        <div className="px-4 py-3 flex gap-4">
          <span className="text-label-small text-on-surface-variant w-32 shrink-0">이메일</span>
          <span className="text-body-small">{user.email}</span>
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
        <div className="rounded border border-outline-variant overflow-hidden">
          <table className="w-full text-body-small">
            <thead>
              <tr className="border-b border-outline-variant bg-surface-container-low">
                <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium">워크스페이스</th>
                <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium">유형</th>
                <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium">역할</th>
                <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium">가입일</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {memberships.map((m) => {
                async function doRemove() {
                  'use server';
                  return toActionState(await removeWorkspaceMemberAction(m.workspaceId, user.id), '멤버를 제외했습니다.');
                }
                return (
                  <tr
                    key={m.workspaceId}
                    className="border-b border-outline-variant last:border-0"
                  >
                    <td className="px-4 py-3"><Link href={`${m.workspaceType === 'buyer' ? '/buyers' : '/sellers'}/${m.workspaceId}`} className="text-primary hover:underline">{m.workspaceName}</Link></td>
                    <td className="px-4 py-3 text-label-small text-on-surface-variant">
                      {m.workspaceType === 'buyer' ? '구매사' : 'PG사'}
                    </td>
                    <td className="px-4 py-3 text-label-small">
                      {m.role === 'admin' ? '관리자' : '멤버'}
                    </td>
                    <td className="px-4 py-3 md-numeric text-label-small text-on-surface-variant">
                      {formatDateKST(m.joinedAt)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {canManageWorkspace && <ConfirmButton
                        action={doRemove}
                        label="제외"
                        confirmMessage="이 멤버를 제외하시겠습니까?"
                        confirmLabel="제외"
                        labelClassName="text-label-small text-error hover:underline disabled:opacity-40 disabled:cursor-not-allowed"
                        confirmClassName="text-label-small text-error hover:underline"
                        disabled={m.isLastAdmin}
                      />}
                      {canManageWorkspace && m.isLastAdmin && <span className="ml-2 text-label-small text-on-surface-variant">마지막 관리자는 제외할 수 없습니다.</span>}
                    </td>
                  </tr>
                );
              })}
              {memberships.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-on-surface-variant">
                    소속 워크스페이스 없음
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <AdminAuditHistory logs={history} entityType="user" entityId={user.id} />
      {canDelete && <DangerousDeleteForm name={user.name} label="회원" impact={impact} action={doDelete} />}
    </div>
  );
}
