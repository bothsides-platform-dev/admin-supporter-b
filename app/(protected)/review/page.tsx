import { listApplicationsPage } from '@/lib/server/queries/admin/review';
import { AdminListControls } from '@/components/AdminListControls';
import { AdminListPagination } from '@/components/AdminListPagination';
import { listQuery, type ListParams } from '@/lib/admin-list';
import { formatKST } from '@/lib/utils';
import Link from 'next/link';
import { AdminStatusBadge } from '@/components/AdminStatusBadge';
import { requireAdminSession } from '@/lib/auth/admin-session';
import { hasPermission } from '@/lib/auth/permissions';
import { bulkRequestMoreInfoAction } from '@/lib/server/actions/admin/requestMoreInfoAction';
import { redirect } from 'next/navigation';
import { SubmitButton } from '@/components/SubmitButton';

export default async function ReviewListPage({
  searchParams,
}: {
  searchParams: Promise<ListParams & { bulkResult?: string }>;
}) {
  const params = await searchParams;
  const { status, type } = params;
  const { rows: apps, total, page } = await listApplicationsPage(params);
  const returnTo = `/review?${listQuery(params)}`;
  const filtered = Boolean(status || type || params.q || params.from || params.to);
  const canReview = hasPermission(await requireAdminSession(), 'workspace.review');

  async function bulkRequest(formData: FormData) {
    'use server';
    const ids = formData.getAll('applicationIds').map(String);
    const result = await bulkRequestMoreInfoAction(ids, formData.get('reason'));
    const query = new URLSearchParams(listQuery(params));
    query.set('bulkResult', result.ok ? `${result.processed}건 처리, ${result.skipped}건 건너뜀` : result.error === 'REASON_REQUIRED' ? '보완 사유를 입력해 주세요.' : '선택한 신청을 확인해 주세요.');
    redirect(`/review?${query.toString()}`);
  }

  return (
    <div className="space-y-4">
      <h1 className="text-headline-small font-semibold">입점 심사</h1>
      {params.bulkResult && <p role="status" className="rounded border border-outline-variant bg-surface-container-low px-3 py-2 text-body-small">{params.bulkResult}</p>}
      <AdminListControls path="/review" params={params} sortOptions={[{ value: 'name', label: '회사명순' }]} dateLabel="신청일">
        <input name="q" defaultValue={params.q ?? ''} placeholder="회사명 검색" aria-label="회사명 검색" className="rounded border border-outline-variant bg-surface px-3 py-1.5 text-body-small" />
        <select
          name="type"
          aria-label="입점 신청 유형"
          defaultValue={type ?? ''}
          className="rounded border border-outline-variant px-3 py-1.5 text-body-small bg-surface"
        >
          <option value="">전체 유형</option>
          <option value="buyer">구매사</option>
          <option value="pg">PG사</option>
        </select>
        <select
          name="status"
          aria-label="입점 심사 상태"
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
      </AdminListControls>
      <form action={bulkRequest}>
      <div className="overflow-x-auto rounded border border-outline-variant">
        <table className="w-full text-body-small">
          <thead>
            <tr className="border-b border-outline-variant bg-surface-container-low">
              {canReview && <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium">선택</th>}
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
                {canReview && <td className="px-4 py-3"><input type="checkbox" name="applicationIds" value={app.applicationId} disabled={!['submitted', 'review_pending'].includes(app.status)} aria-label={`${app.workspaceName} 선택`} /></td>}
                <td className="px-4 py-3">
                  <span className="text-label-small rounded bg-surface-container px-2 py-0.5">
                    {app.orgType === 'buyer' ? '구매사' : 'PG사'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <Link
                    href={`/review/${app.applicationId}?returnTo=${encodeURIComponent(returnTo)}`}
                    className="text-primary hover:underline"
                  >
                    {app.workspaceName}
                  </Link>
                </td>
                <td className="px-4 py-3 md-numeric text-on-surface-variant">
                  {formatKST(app.submittedAt)}
                </td>
                <td className="px-4 py-3">
                  <AdminStatusBadge status={app.status} />
                </td>
              </tr>
            ))}
            {apps.length === 0 && (
              <tr>
                <td colSpan={canReview ? 5 : 4} className="px-4 py-8 text-center text-on-surface-variant">
                  {filtered ? '검색 조건에 맞는 신청이 없습니다.' : '입점 신청이 없습니다.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {canReview && apps.some((app) => ['submitted', 'review_pending'].includes(app.status)) && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded border border-outline-variant bg-surface p-3">
          <label htmlFor="bulk-review-reason" className="text-label-small">선택한 신청에 보완 요청</label>
          <input id="bulk-review-reason" name="reason" required maxLength={500} placeholder="공통 보완 사유" className="min-w-64 flex-1 rounded border border-outline-variant bg-surface px-3 py-1.5 text-body-small" />
          <SubmitButton className="rounded bg-primary px-3 py-1.5 text-label-small text-on-primary">요청 보내기</SubmitButton>
          <span className="text-label-small text-on-surface-variant">현재 페이지에서 최대 25건 선택</span>
        </div>
      )}
      </form>
      <AdminListPagination path="/review" params={params} page={page} total={total} />
    </div>
  );
}
