import 'server-only';
import { and, desc, gte, ilike, lt, or } from 'drizzle-orm';
import { auditLogs } from '@/lib/db/schema';
import { actionDb } from '@/lib/server/actions/auth/_shared';
import { redact } from '@/lib/observability/redact';
import type { Filters, LogRow, Window } from '@/lib/observability/types';

export async function loadActivity(filters: Filters, window: Window, db = actionDb()): Promise<LogRow[]> {
  const literal = filters.q.replace(/[\\%_]/g, '\\$&');
  const rows = await db.select().from(auditLogs).where(and(
    gte(auditLogs.createdAt, new Date(window.start)), lt(auditLogs.createdAt, new Date(window.end)),
    literal ? or(ilike(auditLogs.action, `%${literal}%`), ilike(auditLogs.entityId, `%${literal}%`)) : undefined,
  )).orderBy(desc(auditLogs.createdAt), desc(auditLogs.id)).limit(100);
  return rows.map(log => ({
    id: log.id, time: log.createdAt.toISOString(), level: 'audit', service: '사용자 활동', message: log.action,
    details: JSON.stringify(redact({ actorUserId: log.actorUserId, workspaceId: log.actorWorkspaceId, entityType: log.entityType, entityId: log.entityId, metadata: log.metadata }), null, 2).slice(0, 12000),
  }));
}
