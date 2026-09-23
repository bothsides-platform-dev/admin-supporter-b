import Link from 'next/link';
import { redirect } from 'next/navigation';
import { SubmitButton } from '@/components/SubmitButton';
import { formatKST } from '@/lib/utils';
import { listWorkspaceNameChangeRequestsPage } from '@/lib/server/queries/admin/workspaceNameChanges';
import { AdminListControls } from '@/components/AdminListControls';
import { AdminListPagination } from '@/components/AdminListPagination';
import { listQuery, type ListParams } from '@/lib/admin-list';
import { requireAdminSession } from '@/lib/auth/admin-session';
import { hasPermission } from '@/lib/auth/permissions';
import { approveWorkspaceNameChangeAction, rejectWorkspaceNameChangeAction } from '@/lib/server/actions/admin/reviewWorkspaceNameChangeAction';

const STATUS_LABEL: Record<string, string> = { pending: '확인 중', approved: '승인', rejected: '거절' };
const ERROR_LABEL: Record<string, string> = {
  INVALID_INPUT: '입력값을 확인한 뒤 다시 시도해 주세요.',
  REQUEST_NOT_PENDING: '이미 처리된 요청이에요. 최신 목록을 확인해 주세요.',
  WORKSPACE_NOT_ACTIVE: '워크스페이스 상태나 현재 이름이 달라 승인할 수 없어요.',
};

export default async function WorkspaceNameChangeRequestsPage({
  searchParams,
}: {
  searchParams: Promise<ListParams & { error?: string }>;
}) {
  const params = await searchParams;
  const { status, error } = params;
  const selectedStatus = status ?? 'pending';
  const { rows: requests, total, page } = await listWorkspaceNameChangeRequestsPage({ ...params, status: selectedStatus });
  const canReview = hasPermission(await requireAdminSession(), 'workspace.review');
  const returnTo = `/name-change-requests?${listQuery({ ...params, status: selectedStatus })}`;
  const filtered = Boolean((status !== undefined && status !== 'pending') || params.q || params.from || params.to);

  async function approve(formData: FormData) {
    'use server';
    const result = await approveWorkspaceNameChangeAction(undefined, String(formData.get('requestId')));
    const next = new URLSearchParams(listQuery({ ...params, status: selectedStatus }));
    if (!result.ok) next.set('error', result.error);
    redirect(`/name-change-requests?${next.toString()}`);
  }
  async function reject(formData: FormData) {
    'use server';
    const result = await rejectWorkspaceNameChangeAction(
      undefined,
      String(formData.get('requestId')),
      String(formData.get('reason') ?? ''),
    );
    const next = new URLSearchParams(listQuery({ ...params, status: selectedStatus }));
    if (!result.ok) next.set('error', result.error);
    redirect(`/name-change-requests?${next.toString()}`);
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-headline-small font-semibold">이름 변경 심사</h1>
        <p className="mt-1 text-body-small text-on-surface-variant">승인하기 전까지 고객 화면에는 기존 이름이 유지됩니다.</p>
      </div>
      {error && ERROR_LABEL[error] && (
        <p role="alert" className="rounded border border-error bg-error-container px-3 py-2 text-body-small text-on-error-container">
          {ERROR_LABEL[error]}
        </p>
      )}
      <AdminListControls path="/name-change-requests" params={params} dateLabel="요청일">
        <input name="q" defaultValue={params.q ?? ''} placeholder="회사명 검색" aria-label="회사명 검색" className="rounded border border-outline-variant bg-surface px-3 py-1.5 text-body-small" />
        <select name="status" aria-label="이름 변경 요청 상태" defaultValue={selectedStatus} className="rounded border border-outline-variant px-3 py-1.5 text-body-small bg-surface">
          <option value="pending">확인 중</option>
          <option value="approved">승인</option>
          <option value="rejected">거절</option>
          <option value="">전체</option>
        </select>
      </AdminListControls>
      <div className="space-y-3">
        {requests.map((request) => (
          <section key={request.id} className="rounded border border-outline-variant bg-surface p-4 space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-label-small text-on-surface-variant">{request.workspaceType === 'buyer' ? '구매사' : request.workspaceType === 'pg' ? 'PG사' : '삭제된 워크스페이스'} · {STATUS_LABEL[request.status] ?? request.status}</p>
                <p className="mt-1 text-body-large"><span className="text-on-surface-variant line-through">{request.currentName}</span><span className="mx-2">→</span><strong>{request.requestedName}</strong></p>
              </div>
              {request.workspaceType && <Link href={`${request.workspaceType === 'buyer' ? `/buyers/${request.workspaceId}` : `/sellers/${request.workspaceId}`}?returnTo=${encodeURIComponent(returnTo)}`} className="text-primary text-label-small hover:underline">회사 보기</Link>}
            </div>
            <dl className="grid gap-1 text-body-small text-on-surface-variant sm:grid-cols-2">
              <div><dt className="inline">요청자 </dt><dd className="inline text-on-surface">{request.requesterName && request.requesterEmail ? `${request.requesterName} · ${request.requesterEmail}` : '탈퇴한 사용자'}</dd></div>
              <div><dt className="inline">요청일 </dt><dd className="inline md-numeric text-on-surface">{formatKST(request.submittedAt)}</dd></div>
              {request.reason && <div className="sm:col-span-2"><dt className="inline">거절 사유 </dt><dd className="inline text-on-surface">{request.reason}</dd></div>}
            </dl>
            {canReview && request.status === 'pending' && (
              <div className="flex flex-col gap-2 border-t border-outline-variant pt-3 sm:flex-row sm:items-end">
                <form action={reject} className="flex flex-1 gap-2">
                  <input type="hidden" name="requestId" value={request.id} />
                  <label htmlFor={`name-change-reject-reason-${request.id}`} className="sr-only">거절 사유</label>
                  <input id={`name-change-reject-reason-${request.id}`} name="reason" required maxLength={500} placeholder="거절 사유" className="min-w-0 flex-1 rounded border border-outline-variant bg-surface px-3 py-1.5 text-body-small" />
                  <SubmitButton className="rounded border border-outline-variant px-3 py-1.5 text-label-small hover:bg-surface-container-low">거절</SubmitButton>
                </form>
                <form action={approve}>
                  <input type="hidden" name="requestId" value={request.id} />
                  <SubmitButton className="w-full rounded bg-primary px-3 py-1.5 text-label-small text-on-primary sm:w-auto">승인</SubmitButton>
                </form>
              </div>
            )}
          </section>
        ))}
        {requests.length === 0 && <p className="rounded border border-outline-variant px-4 py-8 text-center text-body-small text-on-surface-variant">{filtered ? '검색 조건에 맞는 이름 변경 요청이 없습니다.' : '이름 변경 요청이 없습니다.'}</p>}
      </div>
      <AdminListPagination path="/name-change-requests" params={{ ...params, status: selectedStatus }} page={page} total={total} />
    </div>
  );
}
