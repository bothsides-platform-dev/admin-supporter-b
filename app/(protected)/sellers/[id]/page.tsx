import { notFound } from 'next/navigation';
import { getSellerDetail } from '@/lib/server/queries/admin/sellers';
import { getWorkspaceMembers } from '@/lib/server/queries/admin/workspaceMembers';
import { removeWorkspaceMemberAction } from '@/lib/server/actions/admin/removeWorkspaceMemberAction';
import { deleteWorkspaceAction } from '@/lib/server/actions/admin/deleteWorkspaceAction';
import { updateWorkspaceGradeAction } from '@/lib/server/actions/admin/updateWorkspaceGradeAction';
import { AdminStatusBadge } from '@/components/AdminStatusBadge';
import { GradeEditForm } from '@/components/GradeEditForm';
import { formatDateKST } from '@/lib/utils';
import { ConfirmButton } from '@/components/ConfirmButton';
import { requireAdminSession } from '@/lib/auth/admin-session';
import { hasPermission } from '@/lib/auth/permissions';
import { listWorkspaceAuditLogs } from '@/lib/server/queries/admin/audit-log';
import { getWorkspaceDeletionImpact } from '@/lib/server/queries/admin/deletion-impact';
import { AdminAuditHistory } from '@/components/AdminAuditHistory';
import { DangerousDeleteForm } from '@/components/DangerousDeleteForm';
import { safeListReturnTo } from '@/lib/admin-return-to';
import type { MerchantTier } from '@/lib/types/biz-profile';
import { actionFailure, toActionState, type ActionState } from '@/lib/action-state';
import Link from 'next/link';

export default async function SellerDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const { id } = await params;
  const returnTo = safeListReturnTo((await searchParams).returnTo, '/sellers');
  const [detail, members, session, history] = await Promise.all([
    getSellerDetail(id),
    getWorkspaceMembers(id),
    requireAdminSession(),
    listWorkspaceAuditLogs(id),
  ]);
  if (!detail) notFound();

  const { workspace, pgProfile, bids, ownerContact, grade } = detail;
  const canManage = hasPermission(session, 'workspace.manage');
  const canDelete = hasPermission(session, 'workspace.delete');
  const impact = canDelete ? await getWorkspaceDeletionImpact(id) : [];

  async function doDelete(_previous: ActionState, formData: FormData): Promise<ActionState> {
    'use server';
    return deleteWorkspaceAction(workspace.id, '/sellers', String(formData.get('confirmationName') ?? ''), returnTo);
  }

  async function saveGrade(_prev: ActionState, formData: FormData): Promise<ActionState> {
    'use server';
    const gradeRaw = formData.get('grade');
    if (typeof gradeRaw !== 'string' || !gradeRaw) return actionFailure('GRADE_REQUIRED');
    const result = await updateWorkspaceGradeAction(workspace.id, gradeRaw as MerchantTier);
    return toActionState(result, '영중소구간을 저장했습니다.');
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="space-y-1">
        <Link href={returnTo} className="text-on-surface-variant hover:text-on-surface text-body-small">
          ← 목록
        </Link>
        <div className="flex items-center gap-3">
          <h1 className="text-headline-small font-semibold">{workspace.name}</h1>
          <AdminStatusBadge status={workspace.status} />
        </div>
      </div>

      {canManage && <GradeEditForm action={saveGrade} currentGrade={grade} />}

      {pgProfile && (
        <section>
          <h2 className="text-title-small font-semibold mb-3">PG 프로필</h2>
          <div className="rounded border border-outline-variant divide-y divide-outline-variant">
            {pgProfile.bizNo && (
              <div className="px-4 py-3 flex gap-4">
                <span className="text-label-small text-on-surface-variant w-32 shrink-0">사업자번호</span>
                <span className="text-body-small md-numeric">{pgProfile.bizNo}</span>
              </div>
            )}
            {pgProfile.serviceScope?.paymentMethods &&
              pgProfile.serviceScope.paymentMethods.length > 0 && (
                <div className="px-4 py-3 flex gap-4">
                  <span className="text-label-small text-on-surface-variant w-32 shrink-0">결제수단</span>
                  <span className="text-body-small">
                    {pgProfile.serviceScope.paymentMethods.join(', ')}
                  </span>
                </div>
              )}
            {pgProfile.serviceScope?.volumeRange && (
              <div className="px-4 py-3 flex gap-4">
                <span className="text-label-small text-on-surface-variant w-32 shrink-0">거래량 규모</span>
                <span className="text-body-small">{pgProfile.serviceScope.volumeRange}</span>
              </div>
            )}
            {ownerContact && (
              <div className="px-4 py-3 flex gap-4">
                <span className="text-label-small text-on-surface-variant w-32 shrink-0">담당자</span>
                <span className="text-body-small">
                  {ownerContact.name}
                  <span className="text-on-surface-variant ml-2">({ownerContact.email})</span>
                  {ownerContact.phone && (
                    <span className="ml-2 md-numeric">{ownerContact.phone}</span>
                  )}
                </span>
              </div>
            )}
          </div>
        </section>
      )}

      <section>
        <h2 className="text-title-small font-semibold mb-3">멤버 ({members.length}명)</h2>
        <div className="rounded border border-outline-variant overflow-hidden">
          <table className="w-full text-body-small">
            <thead>
              <tr className="border-b border-outline-variant bg-surface-container-low">
                <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium">이름</th>
                <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium">이메일</th>
                <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium">역할</th>
                <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium">가입일</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => {
                async function doRemove() {
                  'use server';
                  return toActionState(await removeWorkspaceMemberAction(workspace.id, m.userId), '멤버를 제외했습니다.');
                }
                return (
                  <tr key={m.userId} className="border-b border-outline-variant last:border-0">
                    <td className="px-4 py-3">
                      <Link href={`/users/${m.userId}`} className="text-primary hover:underline">
                        {m.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-on-surface-variant">{m.email}</td>
                    <td className="px-4 py-3 text-label-small">
                      {m.role === 'admin' ? '관리자' : '멤버'}
                    </td>
                    <td className="px-4 py-3 md-numeric text-label-small text-on-surface-variant">
                      {formatDateKST(m.joinedAt)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {canManage && <ConfirmButton
                        action={doRemove}
                        label="제외"
                        confirmMessage="이 멤버를 제외하시겠습니까?"
                        confirmLabel="제외"
                        labelClassName="text-label-small text-error hover:underline disabled:opacity-40 disabled:cursor-not-allowed"
                        confirmClassName="text-label-small text-error hover:underline"
                        disabled={m.isLastAdmin}
                      />}
                      {canManage && m.isLastAdmin && <span className="ml-2 text-label-small text-on-surface-variant">마지막 관리자는 제외할 수 없습니다.</span>}
                    </td>
                  </tr>
                );
              })}
              {members.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-on-surface-variant">
                    멤버 없음
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-title-small font-semibold mb-3">최근 입찰 ({bids.length}건)</h2>
        <div className="rounded border border-outline-variant overflow-hidden">
          <table className="w-full text-body-small">
            <thead>
              <tr className="border-b border-outline-variant bg-surface-container-low">
                <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium">RFP</th>
                <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium">상태</th>
                <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium">제출일</th>
              </tr>
            </thead>
            <tbody>
              {bids.map((bid) => (
                <tr
                  key={bid.id}
                  className="border-b border-outline-variant last:border-0 hover:bg-surface-container-low"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/rfps/${bid.rfpId}`}
                      className="text-primary hover:underline text-label-small"
                    >
                      {bid.rfpCode ? (
                        <><span className="md-numeric">{bid.rfpCode}</span>{bid.rfpTitle && <span className="text-on-surface-variant ml-1">· {bid.rfpTitle}</span>}</>
                      ) : (
                        <span className="md-numeric">{bid.rfpId.slice(0, 8)}…</span>
                      )}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <AdminStatusBadge status={bid.status} />
                  </td>
                  <td className="px-4 py-3 md-numeric text-label-small text-on-surface-variant">
                    {formatDateKST(bid.submittedAt)}
                  </td>
                </tr>
              ))}
              {bids.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-on-surface-variant">
                    입찰 없음
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <AdminAuditHistory logs={history} entityType="workspace" entityId={workspace.id} workspaceId={workspace.id} />
      {canDelete && <DangerousDeleteForm name={workspace.name} label="워크스페이스" impact={impact} action={doDelete} />}
    </div>
  );
}
