import { cache } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getSellerDetail } from '@/lib/server/queries/admin/sellers';
import { getWorkspaceMembers } from '@/lib/server/queries/admin/workspaceMembers';
import { deleteWorkspaceAction } from '@/lib/server/actions/admin/deleteWorkspaceAction';
import { updateWorkspaceGradeAction } from '@/lib/server/actions/admin/updateWorkspaceGradeAction';
import { AdminStatusBadge } from '@/components/AdminStatusBadge';
import { GradeEditForm } from '@/components/GradeEditForm';
import { formatDateKST } from '@/lib/utils';
import { AdminPageHeader } from '@/components/AdminPageHeader';
import { CopyableValue } from '@/components/CopyableValue';
import { AdminSectionNav } from '@/components/AdminSectionNav';
import { AdminDataTable, type AdminTableColumn } from '@/components/AdminDataTable';
import { WorkspaceMembersTable } from '@/components/WorkspaceMembersTable';
import { requireAdminSession } from '@/lib/auth/admin-session';
import { hasPermission } from '@/lib/auth/permissions';
import { listWorkspaceAuditLogs } from '@/lib/server/queries/admin/audit-log';
import { getWorkspaceDeletionImpact } from '@/lib/server/queries/admin/deletion-impact';
import { AdminAuditHistory } from '@/components/AdminAuditHistory';
import { DangerousDeleteForm } from '@/components/DangerousDeleteForm';
import { listReturnLabel, safeListReturnTo } from '@/lib/admin-return-to';
import type { MerchantTier } from '@/lib/types/biz-profile';
import { actionFailure, toActionState, type ActionState } from '@/lib/action-state';
import Link from 'next/link';

// generateMetadata 와 본문이 같은 조회를 한 번만 하도록 요청 단위로 캐시한다.
const loadSeller = cache((id: string) => getSellerDetail(id));

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const detail = await loadSeller((await params).id);
  return { title: detail ? detail.workspace.name : '판매사' };
}

type SellerBid = NonNullable<Awaited<ReturnType<typeof getSellerDetail>>>['bids'][number];

const BID_COLUMNS: AdminTableColumn<SellerBid>[] = [
  {
    key: 'rfp', label: 'RFP',
    render: (bid) => (
      <Link href={`/rfps/${bid.rfpId}`} className="text-primary hover:underline text-label-small">
        {bid.rfpCode ? (
          <><span className="md-numeric">{bid.rfpCode}</span>{bid.rfpTitle && <span className="text-on-surface-variant ml-1">, {bid.rfpTitle}</span>}</>
        ) : (
          <span className="md-numeric">{bid.rfpId.slice(0, 8)}…</span>
        )}
      </Link>
    ),
  },
  { key: 'status', label: '상태', render: (bid) => <AdminStatusBadge status={bid.status} /> },
  { key: 'submittedAt', label: '제출일', cellClassName: 'md-numeric text-label-small text-on-surface-variant', render: (bid) => formatDateKST(bid.submittedAt) },
];

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
    loadSeller(id),
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
      <AdminPageHeader
        title={workspace.name}
        breadcrumbs={[{ label: listReturnLabel(returnTo, '판매사'), href: returnTo }]}
        badges={<AdminStatusBadge status={workspace.status} />}
        meta={<span>워크스페이스 ID <CopyableValue value={workspace.id} label="워크스페이스 ID" numeric /></span>}
      ><Link href={`/tasks?workspace=${workspace.id}`} className="text-body-small text-primary">이 회사의 후속 업무</Link></AdminPageHeader>
      <AdminSectionNav items={[...(pgProfile ? [{ id: 'pg-profile', label: 'PG 프로필' }] : []), { id: 'members', label: '멤버' }, { id: 'bids', label: '최근 입찰' }, { id: 'history', label: '변경 이력' }]} />

      {canManage && <GradeEditForm action={saveGrade} currentGrade={grade} />}

      {pgProfile && (
        <section id="pg-profile" className="scroll-mt-4">
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

      <section id="members" className="scroll-mt-4">
        <h2 className="text-title-small font-semibold mb-3">멤버 ({members.length}명)</h2>
        <WorkspaceMembersTable workspaceId={workspace.id} members={members} canManage={canManage} />
      </section>

      <section id="bids" className="scroll-mt-4">
        <h2 className="text-title-small font-semibold mb-3">최근 입찰 ({bids.length}건)</h2>
        <AdminDataTable caption="최근 입찰" rows={bids} columns={BID_COLUMNS} getKey={(bid) => bid.id} emptyMessage="입찰 없음" />
      </section>

      <div id="history" className="scroll-mt-4">
        <AdminAuditHistory logs={history} entityType="workspace" entityId={workspace.id} workspaceId={workspace.id} />
      </div>
      {canDelete && <DangerousDeleteForm name={workspace.name} label="워크스페이스" impact={impact} action={doDelete} />}
    </div>
  );
}
