import Link from 'next/link';
import { AdminPageHeader } from '@/components/AdminPageHeader';
import { AdminListPagination } from '@/components/AdminListPagination';
import { RfpViewTabs } from '@/components/RfpViewTabs';
import { RfpBoardRefresh } from '@/components/RfpBoardRefresh';
import {
  BOARD_PAGE_SIZE,
  BOARD_STAGES,
  boardHref,
  REVIEW_LABELS,
  SIGNING_LABELS,
  type BoardParams,
  type BoardStage,
} from '@/lib/rfp-board';
import { getRfpBoard, type BoardCard } from '@/lib/server/queries/admin/rfpBoard';
import { formatKST } from '@/lib/utils';
import { nextRfpFollowups } from '@/lib/server/queries/admin/followups';

export const metadata = { title: '신청 진행 보드' };
const inputClass = 'rounded border border-outline-variant bg-surface px-3 py-2 text-body-small';

function nextStep(card: BoardCard) {
  switch (card.stage) {
    case 'consulting':
      if (card.overdue) return '구매사 · 마감 후 진행 확인';
      return card.pgNames ? 'PG사 · 상담 또는 견적 제출' : '운영자 · 참여 PG 확인';
    case 'next_pg':
      return '구매사 · 다음 상담 여부 확인';
    case 'selection':
      return '구매사 · 접수된 견적 검토';
    case 'awarded':
      if (card.hasLegacy) return '운영자 · 과거 PG 계약 이력 확인';
      return card.pgNames ? '구매사 · 합의서 요청 확인' : '운영자 · 선정 기록 확인';
    case 'signing':
      if (card.signing === 'sent' || card.signing === 'in_progress') return '구매사 서명 담당자 · 서명';
      if (card.signing === 'awaiting_pg_template') return '구매사 · 서명 요청 준비';
      return '운영자 · 서명 중단 사유 확인';
    case 'completed':
      return '서명 절차 완료';
    case 'ended':
      return card.rfpStatus === 'cancelled' ? '요청 취소' : '거래 종료';
  }
}

function RequestCard({
  card,
  returnTo,
  task,
}: {
  card: BoardCard;
  returnTo: string;
  task?: Awaited<ReturnType<typeof nextRfpFollowups>>[number];
}) {
  const showQuoteDue = ['consulting', 'selection', 'next_pg'].includes(card.stage);
  const section = card.matching || !showQuoteDue ? 'consultations' : 'pg-responses';
  return (
    <li className="rounded border border-outline-variant bg-surface">
      <Link
        href={`/rfps/${card.id}?returnTo=${encodeURIComponent(returnTo)}#${section}`}
        className="block space-y-2 rounded p-3 hover:bg-surface-container-low focus-visible:outline-primary"
      >
        <div className="flex flex-wrap justify-between gap-1 text-label-small text-on-surface-variant">
          <span>{card.code}</span>
          <span>{card.matching ? '맞춤 상담' : '기존 견적 요청'}</span>
        </div>
        <div>
          <p className="font-medium">{card.title}</p>
          <p className="text-body-small">{card.buyer}</p>
        </div>
        <p className="text-body-small">PG · {card.pgNames ?? '현재 참여 기록 없음'}</p>
        <p className="text-body-small">{nextStep(card)}</p>
        {task && (
          <p className="text-body-small">
            {task.title} · {task.owner ?? '내부 담당 미배정'}
            <br />
            다음 연락 {formatKST(task.due)}
          </p>
        )}
        {card.signing && <p className="text-label-small">노온–구매사 · {SIGNING_LABELS[card.signing]}</p>}
        {card.review && !card.signing && <p className="text-label-small">{REVIEW_LABELS[card.review]}</p>}
        {showQuoteDue && (
          <p className={card.overdue ? 'text-label-small text-error' : 'text-label-small'}>
            {card.matching ? '현재 상담 견적 마감' : '최종 견적 마감'} {formatKST(card.deadline)}
            {card.overdue && ' · 기한 경과'}
          </p>
        )}
        {card.signingDue && ['sent', 'in_progress'].includes(card.signing ?? '') && (
          <p className="text-label-small">서명 기한 {formatKST(card.signingDue)}</p>
        )}
        <p className="text-label-small text-on-surface-variant">
          {card.event} · {formatKST(card.eventAt)}
        </p>
      </Link>
    </li>
  );
}

export default async function RfpBoardPage({ searchParams }: { searchParams: Promise<BoardParams> }) {
  const params = await searchParams;
  const rows = await getRfpBoard(params);
  const tasks = await nextRfpFollowups(rows.map((r) => r.id));
  const byRfp = new Map(tasks.map((t) => [t.rfpId, t]));
  const selected =
    params.status && Object.hasOwn(BOARD_STAGES, params.status) ? (params.status as BoardStage) : undefined;
  const stages = selected ? [selected] : (Object.keys(BOARD_STAGES) as BoardStage[]);
  const returnTo = boardHref(params);
  return (
    <div className="space-y-5">
      <AdminPageHeader title="신청 진행 보드">
        <RfpBoardRefresh checkedAt={formatKST(new Date())} />
      </AdminPageHeader>
      <RfpViewTabs current="board" />
      <form action="/rfps/board" className="flex flex-wrap items-end gap-3 text-body-small">
        <label className="grid gap-1">
          신청 검색
          <input
            className={inputClass}
            name="q"
            type="search"
            defaultValue={params.q}
            placeholder="구매사명, RFP 코드, 제목"
          />
        </label>
        <label className="grid gap-1">
          참여 PG사
          <input className={inputClass} name="pg" type="search" defaultValue={params.pg} />
        </label>
        <label className="grid gap-1">
          신청 유형
          <select className={inputClass} name="type" defaultValue={params.type ?? ''}>
            <option value="">전체 유형</option>
            <option value="matching">맞춤 상담</option>
            <option value="legacy">기존 견적 요청</option>
          </select>
        </label>
        <label className="grid gap-1">
          진행 단계
          <select className={inputClass} name="status" defaultValue={selected ?? ''}>
            <option value="">전체 단계</option>
            {Object.entries(BOARD_STAGES).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <button className="rounded bg-primary px-4 py-2 text-on-primary">조회</button>
        <Link href="/rfps/board" className="p-2 text-primary">
          초기화
        </Link>
      </form>
      {!rows.length ? (
        <p className="rounded border border-outline-variant p-6 text-body-small">
          조건에 맞는 신청이 없습니다.
        </p>
      ) : (
        <div className="flex flex-wrap items-start gap-3">
          {stages.map((stage) => {
            const cards = rows.filter((row) => row.stage === stage);
            const total = cards[0]?.total ?? 0;
            return (
              <section
                key={stage}
                className="min-w-0 w-full space-y-3 rounded-lg bg-surface-container-low p-3 sm:w-72"
              >
                <h2 className="flex justify-between font-medium">
                  {BOARD_STAGES[stage]} <span className="md-numeric">{total}건</span>
                </h2>
                {total ? (
                  <ul className="space-y-2">
                    {cards.map((card) => (
                      <RequestCard key={card.id} card={card} returnTo={returnTo} task={byRfp.get(card.id)} />
                    ))}
                  </ul>
                ) : (
                  <p className="text-body-small text-on-surface-variant">해당 신청 없음</p>
                )}
                {!selected && total > BOARD_PAGE_SIZE && (
                  <Link className="text-body-small text-primary" href={boardHref(params, stage, '1')}>
                    {total}건 모두 보기
                  </Link>
                )}
              </section>
            );
          })}
        </div>
      )}
      {selected && rows.length > 0 && (
        <AdminListPagination
          path="/rfps/board"
          page={rows[0].page}
          total={rows[0].total}
          pageSize={BOARD_PAGE_SIZE}
          hrefFor={(page) => boardHref(params, selected, String(page))}
        />
      )}
    </div>
  );
}
