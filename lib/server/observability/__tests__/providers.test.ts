import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseFilters, queryWindow } from '@/lib/observability/filters';
import { attempt, endpoint, fetchJson } from '../http';
import { axiomQuery, loadIssues, loadLogs, lokiQuery } from '../logs';
import { loadMetrics, metricDefinitions } from '../metrics';

vi.mock('server-only', () => ({}));
const fetcher = vi.fn<typeof fetch>();
const now = new Date('2026-11-17T03:00:00Z');
const filters = parseFilters({ view: 'logs' }, now);
const window = queryWindow(filters, now);
const json = (body: unknown) => new Response(JSON.stringify(body));

beforeEach(() => {
  fetcher.mockReset(); vi.stubGlobal('fetch', fetcher);
  for (const [name, value] of Object.entries({
    GRAFANA_METRICS_QUERY_URL: 'https://metrics.example/api/prom', GRAFANA_LOGS_QUERY_URL: 'https://logs.example',
    GRAFANA_READ_TOKEN: 'test-read-secret', GRAFANA_METRICS_USER: '123', GRAFANA_LOGS_USER: '456',
    AXIOM_QUERY_TOKEN: 'test-query-secret', AXIOM_QUERY_DATASET: 'bidit-production', AXIOM_QUERY_URL: 'https://api.axiom.co',
    SENTRY_READ_TOKEN: 'test-sentry-secret', SENTRY_OBSERVABILITY_ORG: 'bidit', SENTRY_OBSERVABILITY_PROJECTS: '101,102', SENTRY_QUERY_URL: 'https://sentry.io',
  })) vi.stubEnv(name, value);
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('provider adapters', () => {
  it('운영 Caddy의 subroute와 상태 코드가 있는 응답 지표로 5xx를 계산한다', () => {
    const query = metricDefinitions('production').find(metric => metric.id === 'errors')!.query;
    expect(query).toContain('handler="subroute"');
    expect(query).toContain('caddy_http_request_duration_seconds_count');
    expect(query).not.toContain('caddy_http_requests_total');
  });
  it('수집원 미설정은 네트워크 요청 없이 연결 전 상태로 반환한다', async () => {
    vi.stubEnv('GRAFANA_READ_TOKEN', '');
    expect(await loadLogs(filters, window, 'production')).toMatchObject({ state: 'unconfigured' });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('Loki 스트림들을 최신순으로 합치고 민감정보를 제거한다', async () => {
    fetcher.mockResolvedValue(json({ status: 'success', data: { resultType: 'streams', result: [
      { stream: { service: 'admin' }, values: [['1794884400000000000', '{"level":"error","msg":"failed","token":"never-show"}']] },
      { stream: { service: 'caddy' }, values: [['1794884401000000000', 'newest event']] },
    ] } }));
    const result = await loadLogs(filters, window, 'production');
    expect(result.state).toBe('ready');
    if (result.state !== 'ready') throw new Error('Expected data');
    expect(result.data.map(row => row.service)).toEqual(['caddy', 'admin']);
    expect(JSON.stringify(result)).not.toContain('never-show');
    const [url, options] = fetcher.mock.calls[0];
    expect(String(url)).toContain('/loki/api/v1/query_range?');
    expect(options).toMatchObject({ cache: 'no-store', redirect: 'error' });
  });
  it('검색어를 LogQL/APL 실행문이 아닌 인용된 문자열로 보낸다', () => {
    const malicious = '\"} | logfmt | level=\"error';
    const selected = parseFilters({ q: malicious, source: 'axiom' }, now);
    expect(lokiQuery(selected, 'production')).toBe('{environment="production",job="admin-observability"} |= ' + JSON.stringify(malicious));
    expect(axiomQuery('bidit-prod', selected)).toBe('["bidit-prod"] | where msg contains ' + JSON.stringify(malicious) + ' | sort by _time desc | take 100');
  });
  it('Axiom tabular 응답의 컬럼 배열을 행으로 변환한다', async () => {
    fetcher.mockResolvedValue(json({ status: { isPartial: false }, tables: [{ fields: [{ name: '_time' }, { name: 'msg' }, { name: 'level' }], columns: [['2026-11-17T02:59:00Z'], ['accepted'], [30]] }] }));
    const result = await loadLogs({ ...filters, source: 'axiom' }, window, 'production');
    expect(result).toMatchObject({ state: 'ready', data: [{ message: 'accepted', level: 'info' }] });
    const [url, options] = fetcher.mock.calls[0];
    expect(String(url)).toBe('https://api.axiom.co/v1/query/_apl?format=tabular');
    expect(JSON.parse(String(options?.body))).toMatchObject({ startTime: window.start, endTime: window.end });
  });
  it('부분 응답과 429를 성공·0건으로 위장하지 않고 원문 오류를 숨긴다', async () => {
    fetcher.mockResolvedValueOnce(json({ status: { isPartial: true }, tables: [] }));
    expect(await loadLogs({ ...filters, source: 'axiom' }, window, 'production')).toMatchObject({ state: 'error' });
    fetcher.mockResolvedValueOnce(new Response('test-read-secret', { status: 429 }));
    const result = await loadLogs(filters, window, 'production');
    expect(result).toMatchObject({ state: 'error', message: expect.stringContaining('한도') });
    expect(JSON.stringify(result)).not.toContain('test-read-secret');
  });
  it('Sentry 조회는 지정 프로젝트와 환경으로 한정한다', async () => {
    fetcher.mockResolvedValueOnce(json([{ id: '1', title: 'failure', count: '4', lastSeen: now.toISOString(), project: { slug: 'admin' }, permalink: 'https://evil.example/issue' }]));
    const result = await loadIssues(filters, window, 'production');
    expect(result).toMatchObject({ state: 'ready', data: [{ permalink: null }] });
    const url = new URL(String(fetcher.mock.calls[0][0]));
    expect(url.searchParams.getAll('project')).toEqual(['101', '102']);
    expect(url.searchParams.get('environment')).toBe('production');
    vi.stubEnv('SENTRY_OBSERVABILITY_PROJECTS', ','); fetcher.mockClear();
    expect(await loadIssues(filters, window, 'production')).toMatchObject({ state: 'error' });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('지표의 NaN·무한값을 0으로 표시하지 않는다', async () => {
    fetcher.mockImplementation(async () => json({ status: 'success', data: { resultType: 'matrix', result: [{ metric: { instance: 'vm' }, values: [[1794884400, 'NaN'], [1794884460, '+Inf'], [1794884520, '0']] }] } }));
    const metrics = await loadMetrics(window, 'production');
    expect(metrics[0].result).toMatchObject({ state: 'ready', data: [{ points: [[1794884400000, null], [1794884460000, null], [1794884520000, 0]] }] });
    for (const [address] of fetcher.mock.calls) {
      const url = new URL(String(address));
      expect(url.pathname).toBe('/api/prom/api/v1/query_range');
      expect(url.searchParams.get('query')).toContain('environment="production"');
    }
  });
  it('HTTPS와 제한된 응답 크기를 강제한다', async () => {
    expect(() => endpoint('http://example.com', '/query')).toThrow();
    expect(() => endpoint('https://user:secret@example.com', '/query')).toThrow();
    fetcher.mockResolvedValue(new Response('x'.repeat(2 * 1024 * 1024 + 1)));
    expect(await attempt(() => fetchJson(new URL('https://example.com')))).toMatchObject({ state: 'error' });
  });
});
