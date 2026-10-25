import Link from 'next/link';
import { listGuestJourneys } from '@/lib/server/queries/admin/guestJourneys';
import type { ListParams } from '@/lib/admin-list';
import { AdminListControls } from '@/components/AdminListControls';
import { AdminDataTable } from '@/components/AdminDataTable';
import { AdminListPagination } from '@/components/AdminListPagination';
import { Chip } from '@/components/primitives/Chip';
import { journeyStatus, journeyTime } from '@/lib/guest-journey-display';
export const dynamic = 'force-dynamic';
export default async function GuestJourneysPage({ searchParams }: { searchParams: Promise<ListParams> }) {
  const params = await searchParams;
  const { rows, total, page } = await listGuestJourneys(params);
  return <div className="space-y-4">
    <h1 className="text-headline-small font-semibold">견적 작성 여정</h1>
    <p className="text-body-small text-on-surface-variant">로그인 전 작성부터 가입·견적 요청까지의 기록을 확인해요.</p>
    <AdminListControls path="/guest-journeys" params={params} dateLabel="작성 시작일">
      <input name="q" aria-label="초안 ID, 이메일 또는 구매사명 검색" defaultValue={params.q ?? ''} placeholder="초안 ID, 이메일 또는 구매사명" className="rounded border border-outline-variant px-3 py-1.5 text-body-small bg-surface w-72" />
      <select name="status" aria-label="여정 상태" defaultValue={params.status ?? ''} className="rounded border border-outline-variant px-3 py-1.5 text-body-small bg-surface">
        <option value="">전체 상태</option><option value="in_progress">요청 전</option><option value="submitted">요청 완료</option><option value="deleted">삭제됨</option>
      </select>
    </AdminListControls>
    <AdminDataTable caption="견적 작성 여정 목록" rows={rows} getKey={r => r.draftId} emptyMessage="조건에 맞는 여정이 없어요."
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
