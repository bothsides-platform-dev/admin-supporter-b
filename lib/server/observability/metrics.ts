import 'server-only';
import { z } from 'zod';
import type { Metric, Series, Window } from '@/lib/observability/types';
import { attempt, basic, endpoint, fetchJson, required } from './http';

const matrix = z.object({ status: z.literal('success'), data: z.object({ resultType: z.literal('matrix'), result: z.array(z.object({
  metric: z.record(z.string(), z.string()), values: z.array(z.tuple([z.number(), z.string()])).max(500),
})).max(100) }), warnings: z.array(z.string()).optional() });

export function metricDefinitions(env: string) {
  const scope = `environment=${JSON.stringify(env)}`;
  const node = `${scope},job="integrations/node_exporter"`;
  // The deployed Caddyfile instruments the outer subroute once per request.
  // requests_total has no status code label; completed responses use the histogram count.
  const http = `${scope},job="integrations/caddy",handler="subroute"`;
  return [
    { id: 'cpu', title: 'CPU 사용률', unit: '%', query: `100 * (1 - avg by (instance) (rate(node_cpu_seconds_total{${node},mode="idle"}[5m])))` },
    { id: 'memory', title: '메모리 사용률', unit: '%', query: `100 * (1 - node_memory_MemAvailable_bytes{${node}} / node_memory_MemTotal_bytes{${node}})` },
    { id: 'disk', title: '루트 디스크 사용률', unit: '%', query: `100 * (1 - node_filesystem_avail_bytes{${node},mountpoint="/",fstype!~"tmpfs|overlay"} / node_filesystem_size_bytes{${node},mountpoint="/",fstype!~"tmpfs|overlay"})` },
    { id: 'requests', title: '프록시 요청량', unit: 'req/s', query: `sum by (instance) (rate(caddy_http_requests_total{${http}}[5m]))` },
    { id: 'errors', title: '프록시 5xx 비율', unit: '%', query: `100 * (sum by (instance) (rate(caddy_http_request_duration_seconds_count{${http},code=~"5.."}[5m])) or on(instance) (0 * sum by (instance) (rate(caddy_http_request_duration_seconds_count{${http}}[5m])))) / sum by (instance) (rate(caddy_http_request_duration_seconds_count{${http}}[5m]))` },
    { id: 'latency', title: '프록시 응답시간 p95', unit: 'ms', query: `1000 * histogram_quantile(0.95, sum by (le, instance) (rate(caddy_http_request_duration_seconds_bucket{${http}}[5m])))` },
    { id: 'postgres', title: 'DB 연결 수', unit: '개', query: `sum by (instance) (pg_stat_database_numbackends{${scope},job="integrations/postgres",datname!~"template[01]|postgres"})` },
    { id: 'postgres-up', title: 'DB 접속 상태 (1=연결, 0=실패)', unit: '개', query: `pg_up{${scope},job="integrations/postgres"}` },
    { id: 'targets', title: '수집 대상 상태 (1=연결, 0=실패)', unit: '개', query: `up{${scope},job=~"integrations/.*"}` },
  ] as const;
}

export async function loadMetrics(window: Window, env: string): Promise<Metric[]> {
  return Promise.all(metricDefinitions(env).map(async ({ query, ...definition }) => {
    const result = await attempt(async (): Promise<Series[]> => {
      const url = endpoint(required('GRAFANA_METRICS_QUERY_URL'), 'api/v1/query_range');
      url.search = new URLSearchParams({ query, start: window.start, end: window.end, step: String(window.step), timeout: '6s' }).toString();
      const response = matrix.parse(await fetchJson(url, { headers: { Authorization: basic(required('GRAFANA_METRICS_USER'), required('GRAFANA_READ_TOKEN')) } }));
      // Do not silently report truncated/partial Prometheus results as healthy.
      if (response.warnings?.length) throw new Error('Partial metrics');
      return response.data.result.map(({ metric, values }) => ({
        name: [metric.instance, metric.job, metric.datname].filter(Boolean).join(' · ') || '전체',
        points: values.map(([time, value]) => [time * 1000, Number.isFinite(Number(value)) ? Number(value) : null]),
      }));
    });
    return { ...definition, result };
  }));
}
