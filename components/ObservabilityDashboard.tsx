import Link from 'next/link';
import type { ReactNode } from 'react';
import { AdminPageHeader } from '@/components/AdminPageHeader';
import { AdminViewTabs } from '@/components/AdminViewTabs';
import { kstInput, observabilityHref } from '@/lib/observability/filters';
import { RANGES, SOURCES, VIEWS, type Metric, type Payload, type Result, type Series, type Window } from '@/lib/observability/types';

const inputClass = 'rounded-lg border border-outline-variant bg-surface px-3 py-2 text-body-small';
const dateFormat = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
const time = (value: string) => Number.isFinite(Date.parse(value)) ? dateFormat.format(new Date(value)) : '—';

function State<T>({ result, empty, children }: { result: Result<T[]>; empty: string; children: (data: T[]) => ReactNode }) {
  if (result.state !== 'ready') return <p role="status" className="py-4 text-body-small text-on-surface-variant"><strong>{result.state === 'unconfigured' ? '연결 전' : '조회 실패'}</strong> · {result.message}</p>;
  if (!result.data.length) return <p role="status" className="py-4 text-body-small text-on-surface-variant">{empty}</p>;
  return children(result.data);
}

function Sparkline({ series, window }: { series: Series; window: Window }) {
  const start = Date.parse(window.start), end = Date.parse(window.end);
  const values = series.points.flatMap(([, value]) => value === null ? [] : [value]);
  if (!values.length) return null;
  const low = Math.min(0, ...values), high = Math.max(1, ...values);
  const path = series.points.map(([stamp, value], index) => {
    if (value === null) return '';
    const previous = series.points[index - 1];
    const command = !previous || previous[1] === null || stamp - previous[0] > window.step * 1500 ? 'M' : 'L';
    return `${command}${((stamp - start) / (end - start) * 280).toFixed(1)},${(58 - (value - low) / (high - low) * 52).toFixed(1)}`;
  }).join(' ');
  return <svg viewBox="0 0 280 64" role="img" aria-label={`${series.name} 기간별 추이`} className="mt-2 h-16 w-full text-primary"><title>{series.name} 기간별 추이</title><path d={path} fill="none" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" /></svg>;
}

function MetricCard({ metric, window }: { metric: Metric; window: Window }) {
  return <section className="min-w-0 rounded-xl border border-outline-variant bg-surface-container-low p-4">
    <h2 className="text-title-small font-medium">{metric.title}</h2>
    <State result={metric.result} empty="이 기간에 수집된 지표가 없습니다.">{series => <div className="mt-3 space-y-4">{series.map((entry, index) => {
      const last = entry.points.at(-1);
      const current = last && Date.parse(window.end) - last[0] <= Math.max(window.step * 2, 180) * 1000 ? last[1] : null;
      return <div key={`${entry.name}-${index}`}>
        <p className="break-all text-label-small text-on-surface-variant">{entry.name}</p>
        <p className="text-headline-small tabular-nums">{current == null ? '—' : current.toLocaleString('ko-KR', { maximumFractionDigits: metric.unit === '개' ? 0 : 2 })}<span className="ml-1 text-body-small">{metric.unit}</span></p>
        {current == null && <p className="text-label-small text-on-surface-variant">기준 시각의 유효한 값이 없습니다.</p>}
        <Sparkline series={entry} window={window} />
      </div>;
    })}</div>}</State>
  </section>;
}

export function ObservabilityDashboard({ data }: { data: Payload }) {
  const { filters, window } = data;
  const isLogs = filters.view === 'logs';
  return <div className="space-y-5">
    <AdminPageHeader title="시스템 관측" description="서버 상태, 운영 로그와 오류를 같은 시간 범위로 확인합니다." meta={<><span>환경: {data.environment}</span><span>조회 시각: {time(data.generatedAt)} KST</span></>}>
      <Link href="/metrics" className="text-label-large text-primary hover:underline">핵심 지표</Link>
      <Link href="/audit-log" className="text-label-large text-primary hover:underline">관리자 감사 로그</Link>
    </AdminPageHeader>
    <AdminViewTabs label="관측 항목" tabs={Object.entries(VIEWS).map(([view, label]) => ({ label, active: filters.view === view, href: observabilityHref(filters, { view: view as keyof typeof VIEWS }) }))} />
    <form action="/observability" className="flex flex-wrap items-end gap-3 rounded-xl border border-outline-variant p-4">
      <input type="hidden" name="view" value={filters.view} />
      <label className="grid gap-1 text-label-small">기간<select name="range" defaultValue={filters.range} className={inputClass}>{Object.entries(RANGES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="grid gap-1 text-label-small">종료 시각 (KST, 비우면 현재)<input name="until" type="datetime-local" defaultValue={kstInput(filters.until)} className={inputClass} /></label>
      {isLogs && <>
        <label className="grid gap-1 text-label-small">수집원<select name="source" defaultValue={filters.source} className={inputClass}>{Object.entries(SOURCES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className="grid gap-1 text-label-small">수준<select name="level" defaultValue={filters.level} className={inputClass}>{['all', 'debug', 'info', 'warn', 'error'].map(value => <option key={value} value={value}>{value === 'all' ? '전체' : value}</option>)}</select></label>
        <label className="grid gap-1 text-label-small">서비스 (서버 로그)<select name="service" defaultValue={filters.service} className={inputClass}>{['all', 'bidit', 'admin', 'caddy', 'postgres'].map(value => <option key={value} value={value}>{value === 'all' ? '전체' : value}</option>)}</select></label>
      </>}
      {filters.view !== 'system' && <label className="grid min-w-48 flex-1 gap-1 text-label-small">{filters.view === 'activity' ? '작업명 · 대상 ID' : '메시지 검색'}<input name="q" type="search" defaultValue={filters.q} maxLength={120} className={inputClass} /></label>}
      <button type="submit" className="rounded-lg bg-primary px-4 py-2 text-label-large text-on-primary">조회</button>
      <Link href={observabilityHref(filters, { until: '' })} prefetch={false} className="px-2 py-2 text-label-large text-primary hover:underline">최신 조회</Link>
    </form>
    <p className="text-body-small text-on-surface-variant">{time(window.start)} ~ {time(window.end)} KST · {filters.view === 'system' ? '자동 갱신 없이 조회 시점의 값을 표시합니다. 값이 없으면 —로 표시합니다.' : '최신 100건까지 표시합니다. 이전 기록은 종료 시각을 옮겨 조회하세요.'}</p>
    {data.metrics && <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{data.metrics.map(metric => <MetricCard key={metric.id} metric={metric} window={window} />)}</div>}
    {data.logs && <section aria-label={isLogs ? SOURCES[filters.source] : '사용자 활동 기록'}>
      <h2 className="mb-2 text-title-medium font-medium">{isLogs ? SOURCES[filters.source] : '사용자 활동 기록'}</h2>
      {filters.view === 'activity' && <p className="mb-3 text-body-small text-on-surface-variant">메인 서비스가 기록한 사용자 행동입니다. 관리자 작업은 관리자 감사 로그에서 확인할 수 있습니다.</p>}
      <State result={data.logs} empty="이 조건에 해당하는 기록이 없습니다.">{rows => <div className="overflow-x-auto rounded-xl border border-outline-variant"><table className="w-full text-left text-body-small">
        <thead className="bg-surface-container-low"><tr>{['시각 (KST)', '수준 · 서비스', '메시지 · 상세'].map(title => <th key={title} scope="col" className="px-3 py-2 font-medium">{title}</th>)}</tr></thead>
        <tbody>{rows.map(row => <tr key={row.id} className="border-t border-outline-variant align-top">
          <td className="whitespace-nowrap px-3 py-3 tabular-nums">{time(row.time)}</td>
          <td className="px-3 py-3"><span className="font-medium">{row.level || '—'}</span><br /><span className="text-on-surface-variant">{row.service}</span></td>
          <td className="min-w-64 max-w-3xl px-3 py-3"><p className="whitespace-pre-wrap break-all">{row.message}</p><details className="mt-2"><summary className="cursor-pointer text-label-small text-primary">상세 보기</summary><pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-surface-container-low p-3 text-label-small">{row.details}</pre></details></td>
        </tr>)}</tbody>
      </table></div>}</State>
    </section>}
    {data.issues && <section aria-label="Sentry 미해결 오류">
      <h2 className="mb-2 text-title-medium font-medium">Sentry 미해결 오류</h2>
      <p className="mb-3 text-body-small text-on-surface-variant">선택 기간에 발생한 미해결 이슈입니다. 발생 횟수는 Sentry 이슈의 누적값입니다.</p>
      <State result={data.issues} empty="이 기간에 해당하는 미해결 오류가 없습니다.">{issues => <ul className="divide-y divide-outline-variant rounded-xl border border-outline-variant">{issues.map(issue => <li key={issue.id} className="space-y-1 p-4">
        <p className="break-all text-body-medium font-medium">{issue.permalink ? <a href={issue.permalink} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{issue.title} ↗</a> : issue.title}</p>
        <p className="text-label-small text-on-surface-variant">{issue.project} · 누적 {issue.count}회 · 마지막 발생 {time(issue.lastSeen)} KST</p>
      </li>)}</ul>}</State>
    </section>}
  </div>;
}
