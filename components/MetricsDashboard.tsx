import Link from 'next/link';
import type { ReactNode } from 'react';
import type { FunnelStepKey, MetricsOverview, WeeklyRow } from '@/lib/metrics/compute';
import { formatCount, formatDuration, formatRatio } from '@/lib/metrics/format';
import { WEEK_OPTIONS } from '@/lib/metrics/periods';
import { cn, formatKST } from '@/lib/utils';

// 지표의 정의는 lib/metrics/compute.ts 와 docs/METRICS.md 에 있다. 이 파일은 표시만 한다.

const FUNNEL_LABELS: Record<FunnelStepKey, { label: string; hint?: string }> = {
  created: { label: '워크스페이스 생성', hint: '가입·입점 신청' },
  verified: { label: '이메일 인증' },
  approved: { label: '입점 승인', hint: '인증과 승인을 모두 마침' },
  requested: { label: '첫 요청 발송' },
  quoted: { label: '첫 견적 수신' },
  awarded: { label: '선정' },
};

type Column<Row> = {
  key: string;
  label: string;
  render: (row: Row) => ReactNode;
  /** 숫자 열. 오른쪽 정렬하고 자릿수를 맞춘다. */
  numeric?: boolean;
};

/**
 * 지표용 표. 첫 열은 행 제목(th scope="row")이고 좁은 화면에서도 고정된다.
 * 감싸는 영역은 키보드로 가로 스크롤할 수 있게 포커스를 받는다.
 */
function MetricsTable<Row>({ id, caption, columns, rows, getKey, emptyMessage }: {
  id: string;
  caption: string;
  columns: Column<Row>[];
  rows: Row[];
  getKey: (row: Row) => string;
  emptyMessage: string;
}) {
  const captionId = `${id}-caption`;
  return (
    <div
      role="region"
      aria-labelledby={captionId}
      tabIndex={0}
      className="overflow-x-auto rounded border border-outline-variant focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      <table className="w-full text-body-small">
        <caption id={captionId} className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-outline-variant bg-surface-container-low">
            {columns.map((column, index) => (
              <th
                key={column.key}
                scope="col"
                className={cn(
                  'whitespace-nowrap px-4 py-2 text-label-small font-medium text-on-surface-variant',
                  column.numeric ? 'text-right' : 'text-left',
                  index === 0 && 'sticky left-0 bg-surface-container-low',
                )}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={getKey(row)} className="group border-b border-outline-variant last:border-0 hover:bg-surface-container-low">
              {columns.map((column, index) => index === 0 ? (
                <th
                  key={column.key}
                  scope="row"
                  className="sticky left-0 bg-background px-4 py-2.5 text-left font-normal text-on-surface group-hover:bg-surface-container-low"
                >
                  {column.render(row)}
                </th>
              ) : (
                <td key={column.key} className={cn('px-4 py-2.5', column.numeric && 'md-numeric whitespace-nowrap text-right')}>
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={columns.length} className="px-4 py-8 text-center text-on-surface-variant">{emptyMessage}</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

/** 0 은 흐리게 써서 건수가 있는 칸이 먼저 읽히게 한다. */
function Count({ value }: { value: number }) {
  return <span className={value === 0 ? 'text-on-surface-variant' : 'text-on-surface'}>{formatCount(value)}</span>;
}

function Section({ id, title, description, children }: {
  id: string;
  title: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="space-y-3">
      <div className="space-y-1">
        <h2 id={id} className="text-title-medium font-semibold">{title}</h2>
        {description && <p className="max-w-3xl text-body-small text-on-surface-variant">{description}</p>}
      </div>
      {children}
    </section>
  );
}

function StatTile({ label, value, previous }: { label: string; value: number; previous: number }) {
  return (
    <div className="rounded border border-outline-variant bg-surface p-4">
      <dt className="text-body-small text-on-surface-variant">{label}</dt>
      {/* 큰 숫자는 가변 폭 숫자를 쓴다 (md-numeric 은 표의 열에서만). */}
      <dd className="mt-1 text-3xl font-semibold text-on-surface">{formatCount(value)}</dd>
      <dd className="mt-1 text-body-small text-on-surface-variant">전주 {formatCount(previous)}</dd>
    </div>
  );
}

const SUMMARY: { label: string; field: keyof Omit<WeeklyRow, 'bucket'> }[] = [
  { label: '신규 구매사', field: 'newBuyers' },
  { label: '구매사 승인', field: 'buyerApprovals' },
  { label: '요청 발송', field: 'requestsSent' },
  { label: '견적 수신 요청', field: 'requestsQuoted' },
  { label: '선정', field: 'awards' },
];

export function MetricsDashboard({ overview }: { overview: MetricsOverview }) {
  const { weekly, funnel, liquidity, pgs, active, sources, exclusions } = overview;
  // 진행 중인 주는 건수가 더 늘 수 있어 요약에는 끝난 주를 쓴다.
  const lastWeek = weekly.at(-2);
  const weekBefore = weekly.at(-3);
  const cohortSize = funnel[0]?.count ?? 0;
  const sentInWindow = liquidity.concluded + liquidity.open;
  // 담당자가 없는 PG사 중 기간 내 요청이 없어 표에 나오지 않은 곳.
  const unstaffedHidden = exclusions.registeredOnlyPgs - pgs.filter((row) => !row.staffed).length;

  const liquidityRows = [
    { name: '견적 수신율', value: formatRatio(liquidity.quoted), basis: '종결된 요청 중 견적을 1건 이상 받은 요청' },
    { name: '선정률', value: formatRatio(liquidity.awarded), basis: '종결된 요청 중 선정까지 간 요청' },
    { name: '초대 열람률', value: formatRatio(liquidity.inviteOpened), basis: '종결된 요청의 초대 중 PG사가 열어 본 초대' },
    { name: 'PG 응답률', value: formatRatio(liquidity.pgResponded), basis: '종결된 요청의 초대 중 견적 제출로 이어진 초대' },
    { name: '무응답 마감', value: `${formatCount(liquidity.unanswered)}건`, basis: '견적을 한 건도 받지 못하고 종결된 요청' },
    { name: '첫 견적까지 걸린 시간', value: formatDuration(liquidity.medianFirstQuoteMs), basis: '발송부터 첫 견적 제출까지, 중앙값' },
    { name: '선정까지 걸린 시간', value: formatDuration(liquidity.medianAwardMs), basis: '발송부터 선정까지, 중앙값' },
  ];

  const activeRows = [
    { name: '어제', counts: active.day },
    { name: '최근 7일', counts: active.week },
    { name: '최근 30일', counts: active.month },
  ];

  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <div className="space-y-1">
          <h1 className="text-headline-small font-semibold">핵심 지표</h1>
          <p className="max-w-3xl text-body-small text-on-surface-variant">
            가입부터 선정까지의 흐름과 PG사 응답을 주 단위로 확인해요. 표본이 작은 동안에는 비율보다 건수를 먼저 보세요.
          </p>
        </div>
        <form method="GET" className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-label-small text-on-surface-variant">
            기간
            <select
              name="weeks"
              defaultValue={String(overview.weeks)}
              className="rounded border border-outline-variant bg-surface px-2 py-1.5 text-body-small text-on-surface"
            >
              {WEEK_OPTIONS.map((weeks) => <option key={weeks} value={weeks}>최근 {weeks}주</option>)}
            </select>
          </label>
          <button type="submit" className="rounded bg-primary px-3 py-1.5 text-label-small text-on-primary">적용</button>
        </form>
      </header>

      {lastWeek && weekBefore && (
        <Section id="metrics-summary" title={`지난주 요약 (${lastWeek.bucket.label})`}>
          <dl className="grid grid-cols-2 gap-4 lg:grid-cols-5">
            {SUMMARY.map(({ label, field }) => (
              <StatTile key={field} label={label} value={lastWeek[field]} previous={weekBefore[field]} />
            ))}
          </dl>
        </Section>
      )}

      <Section
        id="metrics-weekly"
        title="주간 추이"
        description="그 주에 일어난 건수예요. 주는 한국 시간 월요일에 시작해요. 활성 워크스페이스는 기록이 남는 행동을 한 곳만 세요."
      >
        <MetricsTable
          id="metrics-weekly"
          caption="주간 추이"
          rows={[...weekly].reverse()}
          getKey={(row) => row.bucket.label}
          emptyMessage="표시할 주가 없어요."
          columns={[
            {
              key: 'week',
              label: '주',
              render: (row) => (
                <span className="whitespace-nowrap">
                  {row.bucket.label}
                  {row.bucket.inProgress && <span className="ml-2 text-on-surface-variant">진행 중</span>}
                </span>
              ),
            },
            { key: 'newBuyers', label: '신규 구매사', numeric: true, render: (row) => <Count value={row.newBuyers} /> },
            { key: 'newPgs', label: '신규 PG', numeric: true, render: (row) => <Count value={row.newPgs} /> },
            { key: 'buyerApprovals', label: '구매사 승인', numeric: true, render: (row) => <Count value={row.buyerApprovals} /> },
            { key: 'requestsSent', label: '요청 발송', numeric: true, render: (row) => <Count value={row.requestsSent} /> },
            { key: 'requestsQuoted', label: '견적 수신 요청', numeric: true, render: (row) => <Count value={row.requestsQuoted} /> },
            { key: 'awards', label: '선정', numeric: true, render: (row) => <Count value={row.awards} /> },
            { key: 'activeBuyers', label: '활성 구매사', numeric: true, render: (row) => <Count value={row.activeBuyers} /> },
            { key: 'activePgs', label: '활성 PG', numeric: true, render: (row) => <Count value={row.activePgs} /> },
          ]}
        />
      </Section>

      <Section
        id="metrics-funnel"
        title="구매사 퍼널"
        description={`최근 ${overview.weeks}주에 만들어진 구매사 워크스페이스 ${formatCount(cohortSize)}곳이 어디까지 갔는지 보여줘요. 각 단계는 앞 단계를 모두 마친 곳만 세요.`}
      >
        <MetricsTable
          id="metrics-funnel"
          caption="구매사 퍼널"
          rows={funnel.map((step, index) => ({ step, previous: funnel[index - 1] }))}
          getKey={(row) => row.step.key}
          emptyMessage="표시할 단계가 없어요."
          columns={[
            {
              key: 'step',
              label: '단계',
              render: ({ step }) => (
                <span className="whitespace-nowrap">
                  {FUNNEL_LABELS[step.key].label}
                  {FUNNEL_LABELS[step.key].hint && (
                    <span className="ml-2 text-on-surface-variant">{FUNNEL_LABELS[step.key].hint}</span>
                  )}
                </span>
              ),
            },
            { key: 'count', label: '워크스페이스', numeric: true, render: ({ step }) => <Count value={step.count} /> },
            {
              key: 'bar',
              label: '코호트 대비',
              render: ({ step }) => {
                const share = cohortSize === 0 ? 0 : (step.count / cohortSize) * 100;
                return (
                  // 숫자는 옆 칸에 글자로 있으므로 막대는 보조 표현이다.
                  <div
                    aria-hidden="true"
                    title={`${FUNNEL_LABELS[step.key].label}: ${formatCount(step.count)}곳`}
                    className="h-2.5 w-full min-w-32 rounded-r-[4px] bg-primary-container"
                  >
                    {step.count > 0 && (
                      <div className="h-full rounded-r-[4px] bg-primary" style={{ width: `${share}%` }} />
                    )}
                  </div>
                );
              },
            },
            {
              key: 'conversion',
              label: '직전 단계 대비',
              numeric: true,
              render: ({ step, previous }) => previous ? formatRatio({ num: step.count, den: previous.count }) : '—',
            },
            {
              key: 'duration',
              label: '직전 단계부터 걸린 시간',
              numeric: true,
              render: ({ step }) => formatDuration(step.medianFromPrevMs),
            },
          ]}
        />
        <p className="text-body-small text-on-surface-variant">
          걸린 시간은 중앙값이에요. 신규사업체 자동 승인은 이메일 인증보다 먼저 일어날 수 있어, 입점 승인 단계는 둘을 모두 마친 시점으로 봐요.
        </p>
      </Section>

      <Section
        id="metrics-liquidity"
        title="PG사 응답과 매칭"
        description={`최근 ${overview.weeks}주에 발송된 요청 ${formatCount(sentInWindow)}건 중 종결 ${formatCount(liquidity.concluded)}건, 진행 중 ${formatCount(liquidity.open)}건이에요. 진행 중인 요청은 비율에 넣지 않아요.`}
      >
        <MetricsTable
          id="metrics-liquidity"
          caption="PG사 응답과 매칭"
          rows={liquidityRows}
          getKey={(row) => row.name}
          emptyMessage="표시할 지표가 없어요."
          columns={[
            { key: 'name', label: '지표', render: (row) => <span className="whitespace-nowrap">{row.name}</span> },
            { key: 'value', label: '값', numeric: true, render: (row) => <span className="whitespace-nowrap text-on-surface">{row.value}</span> },
            { key: 'basis', label: '기준', render: (row) => <span className="text-on-surface-variant">{row.basis}</span> },
          ]}
        />
      </Section>

      <Section
        id="metrics-pgs"
        title="PG사별 현황"
        description={`최근 ${overview.weeks}주에 발송된 요청 기준이에요. 재견적은 같은 요청으로 한 번만 세요.`}
      >
        <MetricsTable
          id="metrics-pgs"
          caption="PG사별 현황"
          rows={pgs}
          getKey={(row) => row.id}
          emptyMessage="집계할 PG사가 없어요."
          columns={[
            {
              key: 'name',
              label: 'PG사',
              render: (row) => (
                <span className="whitespace-nowrap">
                  <Link href={`/sellers/${row.id}`} className="text-primary hover:underline">{row.name}</Link>
                  {!row.staffed && <span className="ml-2 text-on-surface-variant">담당자 미합류</span>}
                </span>
              ),
            },
            { key: 'invited', label: '받은 요청', numeric: true, render: (row) => <Count value={row.invited} /> },
            { key: 'opened', label: '열람', numeric: true, render: (row) => <Count value={row.opened} /> },
            { key: 'quoted', label: '견적 제출', numeric: true, render: (row) => <Count value={row.quoted} /> },
            { key: 'won', label: '선정', numeric: true, render: (row) => <Count value={row.won} /> },
            {
              key: 'lastActive',
              label: '최근 활동일',
              numeric: true,
              render: (row) => row.lastActiveDay ?? <span className="text-on-surface-variant">기록 없음</span>,
            },
          ]}
        />
        {unstaffedHidden > 0 && (
          <p className="text-body-small text-on-surface-variant">
            담당자가 아직 합류하지 않았고 이 기간에 요청도 받지 않은 PG사 {formatCount(unstaffedHidden)}곳은 표에 넣지 않았어요.
          </p>
        )}
      </Section>

      <Section
        id="metrics-active"
        title="활성 사용자 (행동 기준)"
        description="요청 작성, 견적 제출, 메시지 전송처럼 기록이 남는 행동을 한 사용자만 세요. 조회만 한 방문은 기록이 없어 포함하지 않으므로 실제 접속자보다 적게 나와요."
      >
        <MetricsTable
          id="metrics-active"
          caption="활성 사용자 (행동 기준)"
          rows={activeRows}
          getKey={(row) => row.name}
          emptyMessage="표시할 기간이 없어요."
          columns={[
            { key: 'name', label: '기간', render: (row) => <span className="whitespace-nowrap">{row.name}</span> },
            { key: 'users', label: '사용자', numeric: true, render: (row) => <Count value={row.counts.users} /> },
            { key: 'buyers', label: '구매사 워크스페이스', numeric: true, render: (row) => <Count value={row.counts.buyers} /> },
            { key: 'pgs', label: 'PG 워크스페이스', numeric: true, render: (row) => <Count value={row.counts.pgs} /> },
          ]}
        />
      </Section>

      <Section
        id="metrics-sources"
        title="가입 유입 경로"
        description={`최근 ${overview.weeks}주에 구매사 워크스페이스를 만든 사용자의 첫 유입 경로예요. 퍼널과 같은 워크스페이스를 세요.`}
      >
        <MetricsTable
          id="metrics-sources"
          caption="가입 유입 경로"
          rows={sources}
          getKey={(row) => row.label}
          emptyMessage="이 기간에 만들어진 구매사 워크스페이스가 없어요."
          columns={[
            {
              key: 'label',
              label: '유입 경로',
              // UTM 값은 사용자가 보낸 문자열이라 길 수 있다. 열을 밀어내지 않게 줄바꿈한다.
              render: (row) => <span className="block max-w-xs wrap-anywhere">{row.label}</span>,
            },
            { key: 'created', label: '워크스페이스 생성', numeric: true, render: (row) => <Count value={row.created} /> },
            { key: 'approved', label: '입점 승인', numeric: true, render: (row) => <Count value={row.approved} /> },
            { key: 'requested', label: '요청 발송', numeric: true, render: (row) => <Count value={row.requested} /> },
          ]}
        />
      </Section>

      <footer className="space-y-1 border-t border-outline-variant pt-4 text-body-small text-on-surface-variant">
        <p>
          집계에서 뺀 것: 시스템·내부 계정 {formatCount(exclusions.users)}명, 테스트·내부 워크스페이스 {formatCount(exclusions.workspaces)}곳,
          그 구매사들의 요청 {formatCount(exclusions.requests)}건. 그래서 회원·구매사·RFP 목록의 건수와 다를 수 있어요.
        </p>
        <p>
          담당자가 합류하지 않은 PG사 {formatCount(exclusions.registeredOnlyPgs)}곳은 신규·활성 수에 넣지 않아요.
          발송 시각이 비어 첫 초대 시각으로 대신한 요청은 {formatCount(exclusions.sentAtFallbacks)}건,
          시점을 알 수 없어 뺀 요청은 {formatCount(exclusions.requestsWithoutSentAt)}건이에요.
        </p>
        <p>
          내부 계정 도메인: {exclusions.domains.length > 0 ? exclusions.domains.join(', ') : '설정되지 않음'}. 이름에 test 또는 테스트가 든 워크스페이스는 테스트로 봐요.
        </p>
        <p>{formatKST(overview.generatedAt)} 기준 (한국 시간)</p>
      </footer>
    </div>
  );
}
