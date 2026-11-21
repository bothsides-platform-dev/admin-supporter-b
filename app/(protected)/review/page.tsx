import { listApplicationsPage, type PendingApplicationRow } from '@/lib/server/queries/admin/review';
import { REVIEW_OPEN_STATUS } from '@/lib/review-queue';
import { AdminPageHeader } from '@/components/AdminPageHeader';
import { AdminDataTable, type AdminTableColumn } from '@/components/AdminDataTable';
import { AdminListControls } from '@/components/AdminListControls';
import { AdminListPagination } from '@/components/AdminListPagination';
import { clearedListHref, hasListFilters, listQuery, type ListParams } from '@/lib/admin-list';
import { formatKST } from '@/lib/utils';
import Link from 'next/link';
import { AdminStatusBadge } from '@/components/AdminStatusBadge';
import { requireAdminSession } from '@/lib/auth/admin-session';
import { hasPermission } from '@/lib/auth/permissions';
import { bulkRequestMoreInfoAction } from '@/lib/server/actions/admin/requestMoreInfoAction';
import { redirect } from 'next/navigation';
import { SubmitButton } from '@/components/SubmitButton';
import { BulkSelectAll, BulkSelectionBar } from '@/components/BulkSelection';
import { ReasonTemplatePicker } from '@/components/ReasonTemplatePicker';
import { MORE_INFO_REASON_TEMPLATES } from '@/lib/review-reason-templates';

export const metadata = { title: '입점 심사' };

export default async function ReviewListPage({
  searchParams,
}: {
  searchParams: Promise<ListParams & { bulkResult?: string }>;
}) {
  const rawParams = await searchParams;
  // 메뉴로 처음 들어오면(상태 파라미터 없음) 처리 대기 건을 오래된 순으로 보여 준다.
  // "전체 상태"는 빈 값이 아니라 `all` 로 보낸다 — 빈 값은 listQuery 가 버려서
  // 페이지 이동·returnTo 에서 기본 큐로 되돌아가기 때문이다.
  const status = rawParams.status === undefined ? REVIEW_OPEN_STATUS : rawParams.status;
  const sort = rawParams.sort ?? (status === REVIEW_OPEN_STATUS ? 'oldest' : undefined);
  const params: ListParams = { ...rawParams, status, sort };
  const { type } = params;
  const { rows: apps, total, page } = await listApplicationsPage(params);
  const returnTo = `/review?${listQuery(params)}`;
  const filtered = hasListFilters(params);
  // 페이지 이동·탭 전환·일괄 처리 뒤에는 행이 바뀌므로 선택 표시를 다시 맞추게 한다.
  const selectionKey = `${returnTo}|${apps.map((app) => `${app.applicationId}:${app.status}`).join(',')}|${rawParams.bulkResult ?? ''}`;
  const canReview = hasPermission(await requireAdminSession(), 'workspace.review');

  async function bulkRequest(formData: FormData) {
    'use server';
    const ids = formData.getAll('applicationIds').map(String);
    const result = await bulkRequestMoreInfoAction(ids, formData.get('reason'));
    const query = new URLSearchParams(listQuery(params));
    query.set('bulkResult', result.ok ? `${result.processed}건 처리, ${result.skipped}건 건너뜀` : result.error === 'REASON_REQUIRED' ? '보완 사유를 입력해 주세요.' : '선택한 신청을 확인해 주세요.');
    redirect(`/review?${query.toString()}`);
  }

  const columns: AdminTableColumn<PendingApplicationRow>[] = [
    ...(canReview ? [{
      key: 'select', label: '선택', header: <BulkSelectAll name="applicationIds" label="현재 페이지에서 처리할 수 있는 신청 전체 선택" resetKey={selectionKey} />,
      render: (app) => <input type="checkbox" name="applicationIds" value={app.applicationId} disabled={!['submitted', 'review_pending'].includes(app.status)} aria-label={`${app.workspaceName} 선택`} />,
    } satisfies AdminTableColumn<PendingApplicationRow>] : []),
    { key: 'type', label: '유형', render: (app) => <span className="text-label-small rounded bg-surface-container px-2 py-0.5">{app.orgType === 'buyer' ? '구매사' : 'PG사'}</span> },
    { key: 'name', label: '회사명', render: (app) => <Link href={`/review/${app.applicationId}?returnTo=${encodeURIComponent(returnTo)}`} className="text-primary hover:underline">{app.workspaceName}</Link> },
    { key: 'submittedAt', label: '신청일', cellClassName: 'md-numeric text-on-surface-variant', render: (app) => formatKST(app.submittedAt) },
    {
      key: 'waiting', label: '대기', cellClassName: 'md-numeric whitespace-nowrap',
      // 처리가 끝난 신청은 대기 중이 아니므로 비워 둔다.
      render: (app) => app.waitingDays == null ? <span className="text-on-surface-variant">—</span> : `${app.waitingDays}일`,
    },
    { key: 'status', label: '상태', render: (app) => <AdminStatusBadge status={app.status} /> },
  ];

  return (
    <div className="space-y-4">
      <AdminPageHeader title="입점 심사">
        <a
          href="https://moneypin.biz/bizno/"
          target="_blank"
          rel="noopener noreferrer"
          className="rounded border border-outline px-2 py-1 text-label-small hover:bg-surface-container-high"
        >
          머니핀(사업자정보 조회)
        </a>
        <a
          href="https://www.pay2pay.co.kr/board/view?bId=faq&wr_id=3779"
          target="_blank"
          rel="noopener noreferrer"
          className="rounded border border-outline px-2 py-1 text-label-small hover:bg-surface-container-high"
        >
          페이투페이(사업자 등급 조회)
        </a>
      </AdminPageHeader>
      {rawParams.bulkResult && <p role="status" className="rounded border border-outline-variant bg-surface-container-low px-3 py-2 text-body-small">{rawParams.bulkResult}</p>}
      <AdminListControls
        path="/review" params={params} viewParams={{ ...rawParams, status }} sortOptions={[{ value: 'name', label: '회사명순' }]} dateLabel="신청일"
        statusLabel="입점 심사 상태별 보기"
        statusViews={[
          { value: REVIEW_OPEN_STATUS, label: '처리 대기' }, { value: 'submitted', label: '신청됨' }, { value: 'review_pending', label: '심사 중' },
          { value: 'needs_more_info', label: '보완 요청' }, { value: 'approved', label: '승인' }, { value: 'rejected', label: '반려' }, { value: 'all', label: '전체' },
        ]}
        extraFilters={type === 'buyer' || type === 'pg' ? [{ key: 'type', label: '유형', value: type === 'buyer' ? '구매사' : 'PG사' }] : []}
      >
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
      </AdminListControls>
      <form action={bulkRequest}>
      <AdminDataTable caption="입점 신청 목록" rows={apps} columns={columns} getKey={(app) => app.applicationId} emptyMessage={filtered ? '검색 조건에 맞는 신청이 없습니다.' : status === REVIEW_OPEN_STATUS ? '처리할 입점 신청이 없습니다.' : '이 상태의 입점 신청이 없습니다.'} emptyAction={filtered ? { label: '필터 초기화', href: clearedListHref('/review', { status, sort: rawParams.sort }) } : undefined} />
      {canReview && apps.some((app) => ['submitted', 'review_pending'].includes(app.status)) && (
        <BulkSelectionBar name="applicationIds" hint="신청을 선택하면 한꺼번에 보완 요청을 보낼 수 있습니다." resetKey={selectionKey}>
          <label htmlFor="bulk-review-reason" className="text-label-small">선택한 신청에 보완 요청</label>
          <ReasonTemplatePicker templates={MORE_INFO_REASON_TEMPLATES} label="자주 쓰는 보완 사유" />
          <input id="bulk-review-reason" name="reason" required maxLength={500} placeholder="공통 보완 사유" className="min-w-64 flex-1 rounded border border-outline-variant bg-surface px-3 py-1.5 text-body-small" />
          <SubmitButton className="rounded bg-primary px-3 py-1.5 text-label-small text-on-primary">요청 보내기</SubmitButton>
        </BulkSelectionBar>
      )}
      </form>
      <AdminListPagination path="/review" params={params} page={page} total={total} />
    </div>
  );
}
