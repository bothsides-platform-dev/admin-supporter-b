import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ObservabilityDashboard } from '../ObservabilityDashboard';
import { parseFilters, queryWindow } from '@/lib/observability/filters';
import type { Payload } from '@/lib/observability/types';

const now = new Date('2026-11-17T03:00:00Z');
const filters = parseFilters({}, now);
const base: Payload = { filters, window: queryWindow(filters, now), generatedAt: now.toISOString(), environment: 'production' };
describe('ObservabilityDashboard', () => {
  it('미연결·실패·빈 결과를 각각 표시한다', () => {
    const html = renderToStaticMarkup(<ObservabilityDashboard data={{ ...base, metrics: [
      { id: 'cpu', title: 'CPU', unit: '%', result: { state: 'unconfigured', message: '설정 필요' } },
      { id: 'disk', title: 'disk', unit: '%', result: { state: 'error', message: '오류' } },
      { id: 'db', title: 'db', unit: '개', result: { state: 'ready', data: [] } },
    ] }} />);
    expect(html).toContain('연결 전'); expect(html).toContain('조회 실패'); expect(html).toContain('수집된 지표가 없습니다');
  });
  it('과거 값과 null을 현재 수치로 표시하지 않는다', () => {
    const html = renderToStaticMarkup(<ObservabilityDashboard data={{ ...base, metrics: [{ id: 'cpu', title: 'CPU', unit: '%', result: { state: 'ready', data: [
      { name: 'stale', points: [[now.getTime() - 3600_000, 99]] },
      { name: 'missing', points: [[now.getTime(), null]] },
    ] } }] }} />);
    expect(html.match(/기준 시각의 유효한 값이 없습니다/g)).toHaveLength(2);
    expect(html).toContain('기간별 추이');
  });
  it('로그 내용은 실행 가능한 HTML로 렌더링하지 않는다', () => {
    const html = renderToStaticMarkup(<ObservabilityDashboard data={{ ...base, filters: { ...filters, view: 'logs' }, logs: { state: 'ready', data: [{ id: '1', time: now.toISOString(), level: 'info', service: 'admin', message: '<script>alert(1)</script>', details: '<b>unsafe</b>' }] } }} />);
    expect(html).toContain('&lt;script&gt;'); expect(html).not.toContain('<script>');
    expect(html).toContain('최신 100건'); expect(html).toContain('상세 보기');
  });
});
