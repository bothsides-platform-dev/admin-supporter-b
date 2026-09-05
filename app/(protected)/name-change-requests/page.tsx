import Link from 'next/link';
import { redirect } from 'next/navigation';
import { SubmitButton } from '@/components/SubmitButton';
import { formatKST } from '@/lib/utils';
import { listWorkspaceNameChangeRequests } from '@/lib/server/queries/admin/workspaceNameChanges';
import { approveWorkspaceNameChangeAction, rejectWorkspaceNameChangeAction } from '@/lib/server/actions/admin/reviewWorkspaceNameChangeAction';

const STATUS_LABEL: Record<string, string> = { pending: '확인 중', approved: '승인', rejected: '거절' };
const ERROR_LABEL: Record<string, string> = {
  INVALID_INPUT: '입력값을 확인한 뒤 다시 시도해 주세요.',
  REQUEST_NOT_PENDING: '이미 처리된 요청이에요. 최신 목록을 확인해 주세요.',
  WORKSPACE_NOT_ACTIVE: '워크스페이스 상태나 현재 이름이 달라 승인할 수 없어요.',
};

function redirectWithError(status: string, code: string): never {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  params.set('error', code);
  redirect(`/name-change-requests?${params.toString()}`);
}

export default async function WorkspaceNameChangeRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; error?: string }>;
}) {
  const { status, error } = await searchParams;
  const selectedStatus = status ?? 'pending';
  const requests = await listWorkspaceNameChangeRequests({ status: selectedStatus });

  async function approve(formData: FormData) {
    'use server';
    const result = await approveWorkspaceNameChangeAction(undefined, String(formData.get('requestId')));
    if (!result.ok) redirectWithError(selectedStatus, result.error);
  }
  async function reject(formData: FormData) {
    'use server';
    const result = await rejectWorkspaceNameChangeAction(
      undefined,
      String(formData.get('requestId')),
      String(formData.get('reason') ?? ''),
    );
    if (!result.ok) redirectWithError(selectedStatus, result.error);
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
      <form method="GET" className="flex gap-2">
        <select name="status" defaultValue={selectedStatus} className="rounded border border-outline-variant px-3 py-1.5 text-body-small bg-surface">
          <option value="pending">확인 중</option>
          <option value="approved">승인</option>
          <option value="rejected">거절</option>
          <option value="">전체</option>
        </select>
        <button type="submit" className="rounded bg-primary text-on-primary px-3 py-1.5 text-label-small">검색</button>
      </form>
      <div className="space-y-3">
        {requests.map((request) => (
          <section key={request.id} className="rounded border border-outline-variant bg-surface p-4 space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-label-small text-on-surface-variant">{request.workspaceType === 'buyer' ? '구매사' : request.workspaceType === 'pg' ? 'PG사' : '삭제된 워크스페이스'} · {STATUS_LABEL[request.status] ?? request.status}</p>
                <p className="mt-1 text-body-large"><span className="text-on-surface-variant line-through">{request.currentName}</span><span className="mx-2">→</span><strong>{request.requestedName}</strong></p>
              </div>
              {request.workspaceType && <Link href={request.workspaceType === 'buyer' ? `/buyers/${request.workspaceId}` : `/sellers/${request.workspaceId}`} className="text-primary text-label-small hover:underline">회사 보기</Link>}
            </div>
            <dl className="grid gap-1 text-body-small text-on-surface-variant sm:grid-cols-2">
              <div><dt className="inline">요청자 </dt><dd className="inline text-on-surface">{request.requesterName && request.requesterEmail ? `${request.requesterName} · ${request.requesterEmail}` : '탈퇴한 사용자'}</dd></div>
              <div><dt className="inline">요청일 </dt><dd className="inline md-numeric text-on-surface">{formatKST(request.submittedAt)}</dd></div>
              {request.reason && <div className="sm:col-span-2"><dt className="inline">거절 사유 </dt><dd className="inline text-on-surface">{request.reason}</dd></div>}
            </dl>
            {request.status === 'pending' && (
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
        {requests.length === 0 && <p className="rounded border border-outline-variant px-4 py-8 text-center text-body-small text-on-surface-variant">이름 변경 요청이 없습니다.</p>}
      </div>
    </div>
  );
}
