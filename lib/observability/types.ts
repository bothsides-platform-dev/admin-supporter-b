export const VIEWS = { system: '시스템', logs: '로그', errors: '오류', activity: '사용자 활동' } as const;
export const SOURCES = { loki: '서버 로그 · Grafana Cloud', axiom: '운영 로그 · Axiom', sentry: '업무 이벤트 · Sentry' } as const;
export const RANGES = { '1h': '최근 1시간', '6h': '최근 6시간', '24h': '최근 24시간', '7d': '최근 7일' } as const;
export type Filters = {
  view: keyof typeof VIEWS;
  source: keyof typeof SOURCES;
  range: keyof typeof RANGES;
  q: string;
  level: 'all' | 'debug' | 'info' | 'warn' | 'error';
  service: 'all' | 'bidit' | 'admin' | 'caddy' | 'postgres';
  until: string;
};
export type Window = { start: string; end: string; step: number };
export type Result<T> = { state: 'ready'; data: T; partial?: boolean } | { state: 'unconfigured' | 'error'; message: string };
export type Series = { name: string; points: [number, number | null][] };
export type Metric = { id: string; title: string; unit: '%' | 'req/s' | 'ms' | '개'; result: Result<Series[]> };
export type LogRow = { id: string; time: string; level: string; service: string; message: string; details: string };
export type Issue = { id: string; title: string; project: string; count: string; lastSeen: string; permalink: string | null };
export type Payload = {
  filters: Filters;
  window: Window;
  generatedAt: string;
  environment: string;
  metrics?: Metric[];
  logs?: Result<LogRow[]>;
  issues?: Result<Issue[]>;
};
