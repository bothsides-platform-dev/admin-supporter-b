import 'server-only';
import { requireAdminPermission } from '@/lib/auth/admin-session';
import { parseFilters, queryWindow } from '@/lib/observability/filters';
import type { Payload } from '@/lib/observability/types';
import { attempt, environment } from './http';
import { loadMetrics } from './metrics';
import { loadIssues, loadLogs } from './logs';

export class InvalidFilters extends Error {}
export class QueryLimit extends Error {}
const budgets = new Map<string, { start: number; count: number; active: number }>();

/** Bounded per-process protection for the documented single PM2 instance. */
function reserve(userId: string) {
  const now = Date.now();
  for (const [key, value] of budgets) if (now - value.start >= 60_000 && value.active === 0) budgets.delete(key);
  const old = budgets.get(userId);
  const budget = old ?? { start: now, count: 0, active: 0 };
  if (now - budget.start >= 60_000) { budget.start = now; budget.count = 0; }
  if (budget.count >= 20 || budget.active >= 2 || (!old && budgets.size >= 500)) throw new QueryLimit();
  budget.count++; budget.active++; budgets.set(userId, budget);
  return () => { budget.active--; };
}

export async function getObservability(params: Record<string, unknown>, now = new Date()): Promise<Payload> {
  // Never move authorization into the provider error boundary or rely on the layout/proxy.
  const admin = await requireAdminPermission('observability.view');
  let filters;
  try { filters = parseFilters(params, now); } catch { throw new InvalidFilters(); }
  const release = reserve(admin.adminUserId);
  try {
    const window = queryWindow(filters, now);
    const env = environment();
    const result: Payload = { filters, window, environment: env, generatedAt: now.toISOString() };
    switch (filters.view) {
      case 'system': result.metrics = await loadMetrics(window, env); break;
      case 'logs': result.logs = await loadLogs(filters, window, env); break;
      case 'errors': result.issues = await loadIssues(filters, window, env); break;
      case 'activity': result.logs = await attempt(async () => (await import('./activity')).loadActivity(filters, window)); break;
    }
    return result;
  } finally { release(); }
}
