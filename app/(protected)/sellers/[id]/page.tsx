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
import type { MerchantGrade } from '@/lib/types/biz-profile';
import Link from 'next/link';

export default async function SellerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [detail, members, session] = await Promise.all([
    getSellerDetail(id),
    getWorkspaceMembers(id),
    requireAdminSession(),
  ]);
  if (!detail) notFound();

  const { workspace, pgProfile, bids, ownerContact, grade } = detail;
  const isSuperAdmin = session.role === 'super_admin';

  async function doDelete() {
    'use server';
    await deleteWorkspaceAction(workspace.id, '/sellers');
  }

  async function saveGrade(formData: FormData) {
    'use server';
    const gradeRaw = formData.get('grade');
    if (typeof gradeRaw !== 'string' || !gradeRaw) throw new Error('GRADE_REQUIRED');
    const result = await updateWorkspaceGradeAction(workspace.id, gradeRaw as MerchantGrade);
    if (!result.ok) throw new Error(result.error);
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="space-y-1">
        <Link href="/sellers" className="text-on-surface-variant hover:text-on-surface text-body-small">
          ← 목록
        </Link>
        <div className="flex items-center gap-3">
          <h1 className="text-headline-small font-semibold">{workspace.name}</h1>
          <AdminStatusBadge status={workspace.status} />
        </div>
      </div>

      <GradeEditForm action={saveGrade} currentGrade={grade} />

      {isSuperAdmin && (
        <section className="rounded border border-error p-4 space-y-2">
          <h2 className="text-title-small font-medium text-error">위험 구역</h2>
          <p className="text-body-small text-on-surface-variant">
            워크스페이스를 영구 삭제합니다. 멤버, 입찰 등 모든 연결 데이터가 함께 삭제됩니다.
          </p>
          <ConfirmButton
            action={doDelete}
            label="워크스페이스 영구 삭제"
            confirmMessage="정말로 이 워크스페이스를 영구 삭제하시겠습니까? 복구 불가합니다."
            confirmLabel="영구 삭제"
            labelClassName="rounded border border-error text-error px-4 py-2 text-label-small hover:bg-error/10"
            confirmClassName="rounded bg-error text-on-error px-4 py-2 text-label-small hover:bg-error/90"
          />
        </section>
      )}

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
                  await removeWorkspaceMemberAction(workspace.id, m.userId);
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
    </div>
  );
}
