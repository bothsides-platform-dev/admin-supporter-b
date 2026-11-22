import { cache } from 'react';
import type { Metadata } from 'next';
import { WorkspaceReviewInfo } from '@/components/WorkspaceReviewInfo';
import { notFound } from 'next/navigation';
import { getBuyerDetail } from '@/lib/server/queries/admin/buyers';
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
const loadBuyer = cache((id: string) => getBuyerDetail(id));

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const detail = await loadBuyer((await params).id);
  return { title: detail ? detail.workspace.name : '구매사' };
}

type BuyerRfp = NonNullable<Awaited<ReturnType<typeof getBuyerDetail>>>['rfps'][number];

const RFP_COLUMNS: AdminTableColumn<BuyerRfp>[] = [
  { key: 'code', label: '코드', cellClassName: 'md-numeric text-label-small', render: (rfp) => rfp.code },
  { key: 'title', label: '제목', render: (rfp) => <Link href={`/rfps/${rfp.id}`} className="text-primary hover:underline">{rfp.title}</Link> },
  { key: 'status', label: '상태', render: (rfp) => <AdminStatusBadge status={rfp.status} /> },
  { key: 'deadline', label: '마감', cellClassName: 'md-numeric text-label-small text-on-surface-variant', render: (rfp) => formatDateKST(rfp.deadline) },
];

export default async function BuyerDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const { id } = await params;
  const returnTo = safeListReturnTo((await searchParams).returnTo, '/buyers');
  const [detail, members, session, history] = await Promise.all([
    loadBuyer(id),
    getWorkspaceMembers(id),
    requireAdminSession(),
    listWorkspaceAuditLogs(id),
  ]);
  if (!detail) notFound();

  const { workspace, rfps, grade } = detail;
  const canManage = hasPermission(session, 'workspace.manage');
  const canDelete = hasPermission(session, 'workspace.delete');
  const impact = canDelete ? await getWorkspaceDeletionImpact(id) : [];

  async function doDelete(_previous: ActionState, formData: FormData): Promise<ActionState> {
    'use server';
    return deleteWorkspaceAction(workspace.id, '/buyers', String(formData.get('confirmationName') ?? ''), returnTo);
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
        breadcrumbs={[{ label: listReturnLabel(returnTo, '구매사'), href: returnTo }]}
        badges={<AdminStatusBadge status={workspace.status} />}
        meta={<span>워크스페이스 ID <CopyableValue value={workspace.id} label="워크스페이스 ID" numeric /></span>}
      ><Link href={`/tasks?workspace=${workspace.id}`} className="text-body-small text-primary">이 회사의 후속 업무</Link></AdminPageHeader>
      <AdminSectionNav items={[{ id: 'review-info', label: '신청·사업자 정보' }, { id: 'members', label: '멤버' }, { id: 'rfps', label: 'RFP 현황' }, { id: 'history', label: '변경 이력' }]} />

      {canManage && <GradeEditForm action={saveGrade} currentGrade={grade} />}

      <div id="review-info" className="scroll-mt-4 space-y-6">
        <WorkspaceReviewInfo
          {...detail}
          canWriteNotes={hasPermission(session, 'notes.write')}
          revalidatePath={`/buyers/${id}`}
        />
      </div>

      <section id="members" className="scroll-mt-4">
        <h2 className="text-title-small font-semibold mb-3">멤버 ({members.length}명)</h2>
        <WorkspaceMembersTable workspaceId={workspace.id} members={members} canManage={canManage} />
      </section>

      <section id="rfps" className="scroll-mt-4">
        <h2 className="text-title-small font-semibold mb-3">RFP 현황 ({rfps.length}건)</h2>
        <AdminDataTable caption="RFP 현황" rows={rfps} columns={RFP_COLUMNS} getKey={(rfp) => rfp.id} emptyMessage="RFP 없음" />
      </section>

      <div id="history" className="scroll-mt-4">
        <AdminAuditHistory logs={history} entityType="workspace" entityId={workspace.id} workspaceId={workspace.id} />
      </div>
      {canDelete && <DangerousDeleteForm name={workspace.name} label="워크스페이스" impact={impact} action={doDelete} />}
    </div>
  );
}
