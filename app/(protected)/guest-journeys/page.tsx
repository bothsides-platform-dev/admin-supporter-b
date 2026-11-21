import { AdminPageHeader } from '@/components/AdminPageHeader';
import Link from 'next/link';
import { listGuestJourneys } from '@/lib/server/queries/admin/guestJourneys';
import { clearedListHref, hasListFilters, type ListParams } from '@/lib/admin-list';
import { AdminListControls } from '@/components/AdminListControls';
import { AdminDataTable } from '@/components/AdminDataTable';
import { AdminListPagination } from '@/components/AdminListPagination';
import { Chip } from '@/components/primitives/Chip';
import { journeyStatus, journeyTime } from '@/lib/guest-journey-display';
export const dynamic = 'force-dynamic';
export const metadata = { title: '견적 작성 여정' };
export default async function GuestJourneysPage({ searchParams }: { searchParams: Promise<ListParams> }) {
  const params = await searchParams;
  const { rows, total, page } = await listGuestJourneys(params);
  return <div className="space-y-4">
    <AdminPageHeader title="견적 작성 여정" description="로그인 전 작성부터 가입·견적 요청까지의 기록을 확인해요." />
    <AdminListControls path="/guest-journeys" params={params} statusLabel="여정 상태별 보기" statusViews={[{ value: '', label: '전체' }, { value: 'in_progress', label: '요청 전' }, { value: 'submitted', label: '요청 완료' }, { value: 'deleted', label: '삭제됨' }]} dateLabel="작성 시작일">
      <input name="q" aria-label="초안 ID, 이메일 또는 구매사명 검색" defaultValue={params.q ?? ''} placeholder="초안 ID, 이메일 또는 구매사명" className="rounded border border-outline-variant px-3 py-1.5 text-body-small bg-surface w-72" />
    </AdminListControls>
    <AdminDataTable caption="견적 작성 여정 목록" rows={rows} getKey={r => r.draftId} emptyMessage="조건에 맞는 여정이 없어요." emptyAction={hasListFilters(params) ? { label: '필터 초기화', href: clearedListHref('/guest-journeys', params) } : undefined}
      columns={[
        { key: 'id', label: '초안', render: r => <Link href={`/guest-journeys/${r.draftId}`} className="text-primary hover:underline md-numeric">{r.draftId}</Link> },
        { key: 'buyer', label: '구매사', render: r => r.workspaceName ?? '로그인 전' },
        { key: 'user', label: '이메일', render: r => r.email ?? '—' },
        { key: 'status', label: '상태', render: r => <Chip label={journeyStatus(r.status)} color={r.status === 'submitted' ? 'tertiary' : 'surface'} /> },
        { key: 'created', label: '시작 (KST)', render: r => <span className="md-numeric">{journeyTime(r.createdAt)}</span> },
      ]} />
    <AdminListPagination path="/guest-journeys" params={params} page={page} total={total} />
  </div>;
}
