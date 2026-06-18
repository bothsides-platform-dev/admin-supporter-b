import { listPgMembers } from '@/lib/server/queries/admin/pgMembers';
import { approveMemberAction } from '@/lib/server/actions/admin/approveMemberAction';
import { rejectMemberAction } from '@/lib/server/actions/admin/rejectMemberAction';
import { AdminStatusBadge } from '@/components/AdminStatusBadge';
import { ConfirmButton } from '@/components/ConfirmButton';
import { formatKST } from '@/lib/utils';

export default async function PgMembersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const members = await listPgMembers({ status });

  return (
    <div className="space-y-4">
      <h1 className="text-headline-small font-semibold">PG 담당자 승인</h1>
      <form method="GET" className="flex gap-2">
        <select
          name="status"
          defaultValue={status ?? ''}
          className="rounded border border-outline-variant px-3 py-1.5 text-body-small bg-surface"
        >
          <option value="">승인 대기</option>
          <option value="approved">승인됨</option>
          <option value="rejected">거부됨</option>
          <option value="all">전체</option>
        </select>
        <button
          type="submit"
          className="rounded bg-primary text-on-primary px-3 py-1.5 text-label-small"
        >
          검색
        </button>
      </form>
      <div className="rounded border border-outline-variant overflow-hidden">
        <table className="w-full text-body-small">
          <thead>
            <tr className="border-b border-outline-variant bg-surface-container-low">
              <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium">
                담당자
              </th>
              <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium">
                워크스페이스
              </th>
              <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium">
                합류일
              </th>
              <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium">
                상태
              </th>
              <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium">
                처리
              </th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => {
              async function doApprove() {
                'use server';
                await approveMemberAction(undefined, m.workspaceId, m.userId);
              }
              async function doReject() {
                'use server';
                await rejectMemberAction(undefined, m.workspaceId, m.userId);
              }
              return (
                <tr
                  key={`${m.workspaceId}:${m.userId}`}
                  className="border-b border-outline-variant last:border-0 hover:bg-surface-container-low"
                >
                  <td className="px-4 py-3">
                    <div>{m.name}</div>
                    <div className="text-label-small text-on-surface-variant">{m.email}</div>
                  </td>
                  <td className="px-4 py-3">{m.workspaceName}</td>
                  <td className="px-4 py-3 md-numeric text-on-surface-variant">
                    {formatKST(m.joinedAt)}
                  </td>
                  <td className="px-4 py-3">
                    <AdminStatusBadge status={m.approvalStatus} />
                  </td>
                  <td className="px-4 py-3">
                    {m.approvalStatus === 'pending_approval' && (
                      <div className="flex items-center gap-3">
                        <ConfirmButton
                          action={doApprove}
                          label="승인"
                          confirmMessage="이 담당자를 승인하시겠습니까?"
                          confirmLabel="승인"
                          labelClassName="text-label-small text-primary hover:underline"
                          confirmClassName="text-label-small text-primary hover:underline"
                        />
                        <ConfirmButton
                          action={doReject}
                          label="거부"
                          confirmMessage="이 담당자를 거부하시겠습니까?"
                          confirmLabel="거부"
                          labelClassName="text-label-small text-error hover:underline"
                          confirmClassName="text-label-small text-error hover:underline"
                        />
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
            {members.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-8 text-center text-on-surface-variant"
                >
                  해당하는 멤버가 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
