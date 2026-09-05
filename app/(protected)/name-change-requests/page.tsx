import Link from 'next/link';
import { formatKST } from '@/lib/utils';
import { listWorkspaceNameChangeRequests } from '@/lib/server/queries/admin/workspaceNameChanges';
import { approveWorkspaceNameChangeAction, rejectWorkspaceNameChangeAction } from '@/lib/server/actions/admin/reviewWorkspaceNameChangeAction';

const STATUS_LABEL: Record<string, string> = { pending: '확인 중', approved: '승인', rejected: '거절' };

export default async function WorkspaceNameChangeRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const selectedStatus = status ?? 'pending';
  const requests = await listWorkspaceNameChangeRequests({ status: selectedStatus });

  async function approve(formData: FormData) {
    'use server';
    await approveWorkspaceNameChangeAction(undefined, String(formData.get('requestId')));
  }
  async function reject(formData: FormData) {
    'use server';
    await rejectWorkspaceNameChangeAction(
      undefined,
      String(formData.get('requestId')),
      String(formData.get('reason') ?? ''),
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-headline-small font-semibold">이름 변경 심사</h1>
        <p className="mt-1 text-body-small text-on-surface-variant">승인하기 전까지 고객 화면에는 기존 이름이 유지됩니다.</p>
      </div>
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
                  <input name="reason" required maxLength={500} placeholder="거절 사유" className="min-w-0 flex-1 rounded border border-outline-variant bg-surface px-3 py-1.5 text-body-small" />
                  <button type="submit" className="rounded border border-outline-variant px-3 py-1.5 text-label-small hover:bg-surface-container-low">거절</button>
                </form>
                <form action={approve}>
                  <input type="hidden" name="requestId" value={request.id} />
                  <button type="submit" className="w-full rounded bg-primary px-3 py-1.5 text-label-small text-on-primary sm:w-auto">승인</button>
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
