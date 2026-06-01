import { notFound } from 'next/navigation';
import { getBuyerDetail } from '@/lib/server/queries/admin/buyers';
import { getWorkspaceMembers } from '@/lib/server/queries/admin/workspaceMembers';
import { removeWorkspaceMemberAction } from '@/lib/server/actions/admin/removeWorkspaceMemberAction';
import { AdminStatusBadge } from '@/components/AdminStatusBadge';
import { ConfirmButton } from '@/components/ConfirmButton';
import Link from 'next/link';

export default async function BuyerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [detail, members] = await Promise.all([
    getBuyerDetail(id),
    getWorkspaceMembers(id),
  ]);
  if (!detail) notFound();

  const { workspace, rfps } = detail;

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="space-y-1">
        <Link href="/buyers" className="text-on-surface-variant hover:text-on-surface text-body-small">
          ← 목록
        </Link>
        <div className="flex items-center gap-3">
          <h1 className="text-headline-small font-semibold">{workspace.name}</h1>
          <AdminStatusBadge status={workspace.status} />
        </div>
      </div>

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
                  <tr
                    key={m.userId}
                    className="border-b border-outline-variant last:border-0"
                  >
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
                      {new Date(m.joinedAt).toLocaleDateString('ko-KR')}
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
        <h2 className="text-title-small font-semibold mb-3">RFP 현황 ({rfps.length}건)</h2>
        <div className="rounded border border-outline-variant overflow-hidden">
          <table className="w-full text-body-small">
            <thead>
              <tr className="border-b border-outline-variant bg-surface-container-low">
                <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium">코드</th>
                <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium">제목</th>
                <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium">상태</th>
                <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium">마감</th>
              </tr>
            </thead>
            <tbody>
              {rfps.map((rfp) => (
                <tr
                  key={rfp.id}
                  className="border-b border-outline-variant last:border-0 hover:bg-surface-container-low"
                >
                  <td className="px-4 py-3 md-numeric text-label-small">{rfp.code}</td>
                  <td className="px-4 py-3">
                    <Link href={`/rfps/${rfp.id}`} className="text-primary hover:underline">
                      {rfp.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <AdminStatusBadge status={rfp.status} />
                  </td>
                  <td className="px-4 py-3 md-numeric text-label-small text-on-surface-variant">
                    {new Date(rfp.deadline).toLocaleDateString('ko-KR')}
                  </td>
                </tr>
              ))}
              {rfps.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-on-surface-variant">
                    RFP 없음
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
