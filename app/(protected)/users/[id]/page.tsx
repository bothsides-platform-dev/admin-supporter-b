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
import { requireAdminSession } from '@/lib/auth/admin-session';

export default async function UserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [detail, session] = await Promise.all([getUserDetail(id), requireAdminSession()]);
  if (!detail) notFound();

  const { user, memberships } = detail;
  const isSuspended = user.status === 'suspended';
  const isDeleted = user.deletedAt != null;
  const isSuperAdmin = session.role === 'super_admin';

  async function doSuspend() {
    'use server';
    await suspendUserAction(user.id);
  }

  async function doUnsuspend() {
    'use server';
    await unsuspendUserAction(user.id);
  }

  async function doDelete() {
    'use server';
    await deleteUserAction(user.id);
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="space-y-1">
        <Link href="/users" className="text-on-surface-variant hover:text-on-surface text-body-small">
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

      <section>
        <h2 className="text-title-small font-semibold mb-3">계정 상태</h2>
        {isSuspended ? (
          <form action={doUnsuspend}>
            <SubmitButton className="rounded border border-primary text-primary px-4 py-2 text-label-small hover:bg-primary/10">
              계정 활성화
            </SubmitButton>
          </form>
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
      </section>

      {isSuperAdmin && (
        <section className="rounded border border-error p-4 space-y-2">
          <h2 className="text-title-small font-medium text-error">위험 구역</h2>
          <p className="text-body-small text-on-surface-variant">
            유저를 영구 삭제합니다. 이 작업은 되돌릴 수 없습니다.
          </p>
          <ConfirmButton
            action={doDelete}
            label="유저 영구 삭제"
            confirmMessage="정말로 이 유저를 영구 삭제하시겠습니까? 복구 불가합니다."
            confirmLabel="영구 삭제"
            labelClassName="rounded border border-error text-error px-4 py-2 text-label-small hover:bg-error/10"
            confirmClassName="rounded bg-error text-on-error px-4 py-2 text-label-small hover:bg-error/90"
          />
        </section>
      )}

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
                  await removeWorkspaceMemberAction(m.workspaceId, user.id);
                }
                return (
                  <tr
                    key={m.workspaceId}
                    className="border-b border-outline-variant last:border-0"
                  >
                    <td className="px-4 py-3">{m.workspaceName}</td>
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
                      <ConfirmButton
                        action={doRemove}
                        label="제외"
                        confirmMessage="이 멤버를 제외하시겠습니까?"
                        confirmLabel="제외"
                        labelClassName="text-label-small text-error hover:underline disabled:opacity-40 disabled:cursor-not-allowed"
                        confirmClassName="text-label-small text-error hover:underline"
                        disabled={m.isLastAdmin}
                      />
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
    </div>
  );
}
