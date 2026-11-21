import 'server-only';
import { z } from 'zod';
import type { Filters, Issue, LogRow, Result, Window } from '@/lib/observability/types';
import { redact, redactText } from '@/lib/observability/redact';
import { attempt, basic, endpoint, fetchJson, required } from './http';

const LIMIT = 100;
const record = z.record(z.string(), z.unknown());
const text = (v: unknown) => typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '';
const levelNames: Record<string, string> = { '10': 'trace', '20': 'debug', '30': 'info', '40': 'warn', '50': 'error', '60': 'fatal', warning: 'warn' };

function row(id: string, time: unknown, data: Record<string, unknown>, service = ''): LogRow {
  const scrubbed = redact(data);
  const level = text(data.level ?? data.severity);
  return {
    id, time: text(time), level: levelNames[level] ?? level,
    service: redactText(service || text(data.service ?? data['service.name'] ?? data['project.name']) || '—'),
    message: redactText(text(data.msg ?? data.message ?? data.body ?? data.action) || '구조화된 기록'),
    details: JSON.stringify(scrubbed, null, 2).slice(0, 12000),
  };
}

const lokiSchema = z.object({ status: z.literal('success'), data: z.object({ resultType: z.literal('streams'), result: z.array(z.object({
  stream: z.record(z.string(), z.string()), values: z.array(z.tuple([z.string().regex(/^\d+$/), z.string()])),
})) }) });

export function lokiQuery(filters: Filters, env: string): string {
  let query = `{environment=${JSON.stringify(env)},job="admin-observability"${filters.service === 'all' ? '' : `,service=${JSON.stringify(filters.service)}`}}`;
  if (filters.q) query += ` |= ${JSON.stringify(filters.q)}`;
  if (filters.level !== 'all') {
    const levels = { debug: 'debug|20', info: 'info|30', warn: 'warn|warning|40', error: 'error|fatal|50|60' };
    query += ` | json | level=~${JSON.stringify(levels[filters.level])}`;
  }
  return query;
}

async function lokiLogs(filters: Filters, window: Window, env: string): Promise<LogRow[]> {
  const url = endpoint(required('GRAFANA_LOGS_QUERY_URL'), 'loki/api/v1/query_range');
  url.search = new URLSearchParams({ query: lokiQuery(filters, env), start: window.start, end: window.end, limit: String(LIMIT), direction: 'backward' }).toString();
  const response = lokiSchema.parse(await fetchJson(url, { headers: { Authorization: basic(required('GRAFANA_LOGS_USER'), required('GRAFANA_READ_TOKEN')) } }));
  return response.data.result.flatMap(({ stream, values }, streamIndex) => values.map(([nano, line], index) => {
    let data: Record<string, unknown> = { message: line };
    try { data = record.parse(JSON.parse(line)); } catch { /* Plain PM2 lines are valid log records. */ }
    return { nano: BigInt(nano), entry: row(`${streamIndex}-${nano}-${index}`, new Date(Number(BigInt(nano) / BigInt(1_000_000))).toISOString(), data, stream.service) };
  })).sort((a, b) => a.nano > b.nano ? -1 : a.nano < b.nano ? 1 : 0).slice(0, LIMIT).map(x => x.entry);
}

const axiomSchema = z.object({
  status: z.object({ isPartial: z.boolean().optional() }).optional(),
  tables: z.array(z.object({ fields: z.array(z.object({ name: z.string() })), columns: z.array(z.array(z.unknown())) })),
});

export function axiomQuery(dataset: string, filters: Filters): string {
  // Dataset and all search values are quoted literals, never executable APL.
  let query = `[${JSON.stringify(dataset)}]`;
  if (filters.q) query += ` | where msg contains ${JSON.stringify(filters.q)}`;
  if (filters.level !== 'all') {
    const numeric = { debug: 20, info: 30, warn: 40, error: 50 }[filters.level];
    query += ` | where tostring(level) in (${JSON.stringify(filters.level)}, ${JSON.stringify(String(numeric))}${filters.level === 'error' ? ', "fatal", "60"' : ''})`;
  }
  return `${query} | sort by _time desc | take ${LIMIT}`;
}

async function axiomLogs(filters: Filters, window: Window): Promise<LogRow[]> {
  const url = endpoint(process.env.AXIOM_QUERY_URL?.trim() || 'https://api.axiom.co', 'v1/query/_apl');
  url.searchParams.set('format', 'tabular');
  const response = axiomSchema.parse(await fetchJson(url, {
    method: 'POST', headers: { Authorization: `Bearer ${required('AXIOM_QUERY_TOKEN')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ apl: axiomQuery(required('AXIOM_QUERY_DATASET'), filters), startTime: window.start, endTime: window.end }),
  }));
  if (response.status?.isPartial) throw new Error('Partial logs');
  return response.tables.flatMap((table, tableIndex) => {
    const count = Math.min(LIMIT, table.columns[0]?.length ?? 0);
    return Array.from({ length: count }, (_, i) => {
      const data = Object.fromEntries(table.fields.map((field, column) => [field.name, table.columns[column]?.[i]]));
      return row(`axiom-${tableIndex}-${i}`, data._time, data, 'bidit');
    });
  }).slice(0, LIMIT);
}

function sentryUrl(path: string, window: Window, env: string): URL {
  const organization = required('SENTRY_OBSERVABILITY_ORG');
  const url = endpoint(process.env.SENTRY_QUERY_URL?.trim() || 'https://sentry.io', `api/0/organizations/${encodeURIComponent(organization)}/${path}/`);
  url.searchParams.set('start', window.start);
  url.searchParams.set('end', window.end);
  url.searchParams.set('environment', env);
  const projects = required('SENTRY_OBSERVABILITY_PROJECTS').split(',').map(p => p.trim());
  if (!projects.length || projects.some(p => !/^[a-zA-Z0-9_-]+$/.test(p) || p === '-1')) throw new Error('Invalid projects');
  for (const project of projects) url.searchParams.append('project', project);
  url.searchParams.set('per_page', String(LIMIT));
  return url;
}

const sentryHeaders = () => ({ Authorization: `Bearer ${required('SENTRY_READ_TOKEN')}` });

async function sentryLogs(filters: Filters, window: Window, env: string): Promise<LogRow[]> {
  const url = sentryUrl('events', window, env);
  url.searchParams.set('dataset', 'logs');
  for (const field of ['id', 'timestamp', 'severity', 'message', 'project.name', 'trace']) url.searchParams.append('field', field);
  url.searchParams.set('sort', '-timestamp');
  url.searchParams.set('query', [filters.q && `message:${JSON.stringify(filters.q)}`, filters.level !== 'all' && `severity:${filters.level === 'warn' ? 'warning' : filters.level}`].filter(Boolean).join(' '));
  const response = z.object({ data: z.array(record) }).parse(await fetchJson(url, { headers: sentryHeaders() }));
  return response.data.slice(0, LIMIT).map((data, i) => row(text(data.id) || `sentry-${i}`, data.timestamp, data));
}

export function loadLogs(filters: Filters, window: Window, env: string): Promise<Result<LogRow[]>> {
  return attempt(() => filters.source === 'loki' ? lokiLogs(filters, window, env) : filters.source === 'axiom' ? axiomLogs(filters, window) : sentryLogs(filters, window, env));
}

export function loadIssues(filters: Filters, window: Window, env: string): Promise<Result<Issue[]>> {
  return attempt(async () => {
    const url = sentryUrl('issues', window, env);
    url.searchParams.set('query', `is:unresolved${filters.q ? ` ${JSON.stringify(filters.q)}` : ''}`);
    url.searchParams.set('sort', 'date');
    const issues = z.array(z.object({ id: z.string(), title: z.string(), count: z.string(), lastSeen: z.string(), permalink: z.string().optional(), project: z.object({ slug: z.string() }) })).parse(await fetchJson(url, { headers: sentryHeaders() }));
    return issues.slice(0, LIMIT).map(issue => {
      let permalink: string | null = null;
      try { const link = new URL(issue.permalink ?? ''); if (link.protocol === 'https:' && (link.hostname === 'sentry.io' || link.hostname.endsWith('.sentry.io'))) permalink = link.href; } catch { /* No external link for invalid URLs. */ }
      return { id: issue.id, title: redactText(issue.title), project: issue.project.slug, count: issue.count, lastSeen: issue.lastSeen, permalink };
    });
  });
}
