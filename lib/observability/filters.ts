import { z } from 'zod';
import type { Filters, Window } from './types';

const schema = z.object({
  view: z.enum(['system', 'logs', 'errors', 'activity']).default('system'),
  source: z.enum(['loki', 'axiom', 'sentry']).default('loki'),
  range: z.enum(['1h', '6h', '24h', '7d']).default('1h'),
  q: z.string().trim().max(120).regex(/^[^\x00-\x1f]*$/).default(''),
  level: z.enum(['all', 'debug', 'info', 'warn', 'error']).default('all'),
  service: z.enum(['all', 'bidit', 'admin', 'caddy', 'postgres']).default('all'),
  until: z.string().max(40).default(''),
});

export function parseFilters(params: Record<string, unknown>, now = new Date()): Filters {
  const filters = schema.parse(params);
  if (filters.until) {
    // datetime-local is explicitly presented as KST, independent of server TZ.
    const value = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(filters.until) ? `${filters.until}:00+09:00` : filters.until;
    z.iso.datetime({ offset: true }).parse(value);
    const date = new Date(value);
    if (!Number.isFinite(date.getTime()) || date > now) throw new Error('Invalid time');
    filters.until = date.toISOString();
  }
  if (filters.source !== 'loki') filters.service = 'all';
  return filters;
}

export function queryWindow(filters: Filters, now = new Date()): Window {
  const hours = { '1h': 1, '6h': 6, '24h': 24, '7d': 168 }[filters.range];
  const end = filters.until ? new Date(filters.until) : now;
  return { start: new Date(end.getTime() - hours * 3_600_000).toISOString(), end: end.toISOString(), step: Math.max(60, Math.ceil(hours * 3600 / 240)) };
}

export function observabilityHref(filters: Filters, patch: Partial<Filters> = {}): string {
  const params = new URLSearchParams(Object.entries({ ...filters, ...patch }).filter(([, value]) => value !== ''));
  return `/observability?${params}`;
}

export function kstInput(iso: string): string {
  return iso ? new Date(new Date(iso).getTime() + 9 * 3_600_000).toISOString().slice(0, 16) : '';
}
