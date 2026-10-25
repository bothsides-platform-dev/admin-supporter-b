import Link from 'next/link';
import type { getGuestJourney } from '@/lib/server/queries/admin/guestJourneys';
import { journeyAction, journeyStatus, journeyStep, journeyTime } from '@/lib/guest-journey-display';
import { Chip } from './primitives/Chip';
import { AdminDataTable } from './AdminDataTable';
import { AdminListPagination } from './AdminListPagination';

type Detail = NonNullable<Awaited<ReturnType<typeof getGuestJourney>>>;
const gaUrl = 'https://analytics.google.com/analytics/web/#/analysis/a396924123p540469131/edit/cd9F5C6iTDSVJEFjjEWsWw';

export function GuestJourneyDetail({ detail }: { detail: Detail }) {
  const { journey, events, answers, lastEvent } = detail;
  return <div className="space-y-6">
    <div className="flex flex-wrap items-center gap-3">
      <Link href="/guest-journeys" className="text-body-small text-on-surface-variant hover:underline">← 여정 목록</Link>
      <h1 className="text-headline-small font-semibold">견적 작성 여정</h1>
      <Chip label={journeyStatus(journey.status)} color={journey.status === 'submitted' ? 'tertiary' : 'surface'} />
    </div>
    <section aria-label="여정 정보" className="rounded border border-outline-variant p-4 space-y-2 text-body-small">
      <p>초안 <span className="md-numeric break-all">{journey.draftId}</span></p>
      <p>시작 <span className="md-numeric">{journeyTime(journey.createdAt)} KST</span></p>
      <p>사용자 {journey.userId ? <Link href={`/users/${journey.userId}`} className="text-primary hover:underline">{journey.userName ?? journey.email ?? journey.userId}</Link> : '로그인 전'}</p>
      {journey.workspaceId && <p>구매사 <Link href={`/buyers/${journey.workspaceId}`} className="text-primary hover:underline">{journey.workspaceName ?? journey.workspaceId}</Link></p>}
      {lastEvent && <p>마지막 관측: {journeyStep(lastEvent.step_id)} · <span className="md-numeric">{journeyTime(lastEvent.observedAt)}</span></p>}
      <p>입력 오류 <span className="md-numeric">{detail.errorCount}</span>회</p>
      <p className="text-on-surface-variant">행동과 답변은 30일 동안 보관해요. 브라우저 관측 기록에는 누락이나 수집 지연이 있을 수 있어요.</p>
    </section>
    <section aria-labelledby="journey-answers" className="space-y-3">
      <h2 id="journey-answers" className="text-title-medium font-semibold">최근 입력 답변</h2>
      <AdminDataTable caption="최근 입력 답변" rows={answers} getKey={e => `${e.funnel_id}:${e.step_id}`} emptyMessage="보관 중인 답변이 없어요."
        columns={[
          { key: 'step', label: '질문', render: e => journeyStep(e.step_id) },
          { key: 'answer', label: '답변', render: e => <span className="whitespace-pre-wrap break-words">{e.answer || '미입력'}</span> },
          { key: 'time', label: '관측 시각 (KST)', render: e => <span className="md-numeric">{journeyTime(e.observedAt)}</span> },
        ]} />
    </section>
    <section aria-labelledby="journey-events" className="space-y-3">
      <h2 id="journey-events" className="text-title-medium font-semibold">전체 행동 이력</h2>
      <AdminDataTable caption="전체 행동 이력" rows={events} getKey={e => e.id} emptyMessage="보관 중인 행동 기록이 없어요."
        columns={[
          { key: 'time', label: '관측 시각 (KST)', render: e => <span className="md-numeric whitespace-nowrap">{journeyTime(e.observedAt)}</span> },
          { key: 'step', label: '단계', render: e => journeyStep(e.step_id) },
          { key: 'action', label: '행동', render: e => <span>{journeyAction(e)}{e.mode === 'edit' ? ' · 수정' : ''}</span> },
          { key: 'answer', label: '당시 답변', render: e => <span className="whitespace-pre-wrap break-words">{e.answer === undefined ? '—' : e.answer || '미입력'}</span> },
        ]} />
      <AdminListPagination path={`/guest-journeys/${journey.draftId}`} params={{}} page={detail.page} total={detail.total} />
    </section>
    <section aria-labelledby="journey-analytics" className="rounded border border-outline-variant p-4 space-y-3 text-body-small">
      <h2 id="journey-analytics" className="text-title-medium font-semibold">분석·녹화 보기</h2>
      <a href={gaUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">GA 사용자 탐색 열기</a>
      <p className="text-on-surface-variant">GA 보고서에서 관측 날짜와 아래 식별자로 사용자를 찾아요. 보고서 반영에는 시간이 걸릴 수 있어요.</p>
      {journey.userId && <p>GA User-ID (서버 확인): <span className="md-numeric break-all">{journey.userId}</span></p>}
      {journey.analytics.length === 0 && <p>확보한 분석 식별자가 없어요.</p>}
      {journey.analytics.map((session, i) => <div key={i} className="border-t border-outline-variant pt-3 space-y-1">
        <p className="md-numeric">{journeyTime(session.observedAt)} KST</p>
        {session.ga && <p>GA client_id: <span className="md-numeric">{session.ga.clientId}</span> / session_id: <span className="md-numeric">{session.ga.sessionId}</span></p>}
        {session.clarity && <p><a href={`https://clarity.microsoft.com/player/xiq81e87yn/${session.clarity.userId}/${session.clarity.sessionId}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Clarity 녹화 열기</a> · 재생 가능 여부는 확인하지 않았어요.</p>}
      </div>)}
    </section>
  </div>;
}
