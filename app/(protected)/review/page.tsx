import { listApplications } from '@/lib/server/queries/admin/review';
import Link from 'next/link';
import { AdminStatusBadge } from '@/components/AdminStatusBadge';

export default async function ReviewListPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; type?: string }>;
}) {
  const { status, type } = await searchParams;
  const apps = await listApplications({ status, type });

  return (
    <div className="space-y-4">
      <h1 className="text-headline-small font-semibold">입점 심사</h1>
      <form method="GET" className="flex gap-2">
        <select
          name="type"
          defaultValue={type ?? ''}
          className="rounded border border-outline-variant px-3 py-1.5 text-body-small bg-surface"
        >
          <option value="">전체 유형</option>
          <option value="buyer">구매사</option>
          <option value="pg">PG사</option>
        </select>
        <select
          name="status"
          defaultValue={status ?? ''}
          className="rounded border border-outline-variant px-3 py-1.5 text-body-small bg-surface"
        >
          <option value="">전체 상태</option>
          <option value="submitted">신청됨</option>
          <option value="review_pending">심사 중</option>
          <option value="needs_more_info">보완 요청</option>
          <option value="approved">승인</option>
          <option value="rejected">반려</option>
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
              <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium">유형</th>
              <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium">회사명</th>
              <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium">신청일</th>
              <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium">상태</th>
            </tr>
          </thead>
          <tbody>
            {apps.map((app) => (
              <tr
                key={app.applicationId}
                className="border-b border-outline-variant last:border-0 hover:bg-surface-container-low"
              >
                <td className="px-4 py-3">
                  <span className="text-label-small rounded bg-surface-container px-2 py-0.5">
                    {app.orgType === 'buyer' ? '구매사' : 'PG사'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <Link
                    href={`/review/${app.applicationId}`}
                    className="text-primary hover:underline"
                  >
                    {app.workspaceName}
                  </Link>
                </td>
                <td className="px-4 py-3 md-numeric text-on-surface-variant">
                  {new Date(app.submittedAt).toLocaleString('ko-KR')}
                </td>
                <td className="px-4 py-3">
                  <AdminStatusBadge status={app.status} />
                </td>
              </tr>
            ))}
            {apps.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-on-surface-variant">
                  신청이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
