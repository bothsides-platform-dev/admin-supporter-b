import { and, count, desc, eq, gte, ilike, inArray, lt, or, sql, type SQL } from 'drizzle-orm';
import { adminAuditLogs, bids, verificationApplications, workspaces } from '@/lib/db/schema';
import { actionDb } from '@/lib/server/actions/auth/_shared';

export type AuditLogRow = typeof adminAuditLogs.$inferSelect;

export type AuditFilters = { page?: number; actor?: string; entityType?: string; entityId?: string; workspaceId?: string; action?: string; from?: string; to?: string };
export const AUDIT_PAGE_SIZE = 30;
export const isAuditUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

function kstDay(value: string, nextDay = false): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const test = new Date(Date.UTC(year, month - 1, day));
  if (test.getUTCFullYear() !== year || test.getUTCMonth() !== month - 1 || test.getUTCDate() !== day) return null;
  const date = new Date(`${value}T00:00:00+09:00`);
  if (nextDay) date.setUTCDate(date.getUTCDate() + 1);
  return date;
}

function auditConditions(filters: AuditFilters): SQL[] {
  const conditions: SQL[] = [];
  if (filters.actor?.trim()) conditions.push(ilike(adminAuditLogs.actor, `%${filters.actor.trim()}%`));
  if (filters.entityType?.trim()) conditions.push(eq(adminAuditLogs.entityType, filters.entityType.trim()));
  if (filters.entityId?.trim()) conditions.push(eq(adminAuditLogs.entityId, filters.entityId.trim()));
  if (filters.workspaceId?.trim()) {
    const id = filters.workspaceId.trim();
    conditions.push(or(
      and(inArray(adminAuditLogs.entityType, ['workspace', 'workspace_member', 'pg_agreement_rates']), eq(adminAuditLogs.entityId, id)),
      and(eq(adminAuditLogs.entityType, 'verification_application'), inArray(adminAuditLogs.entityId,
        actionDb().select({ id: verificationApplications.id }).from(verificationApplications).where(eq(verificationApplications.workspaceId, id)))),
      and(eq(adminAuditLogs.entityType, 'verification_application'), sql`${adminAuditLogs.payloadJson}->'after'->>'workspaceId' = ${id}`),
    )!);
  }
  if (filters.action?.trim()) conditions.push(eq(adminAuditLogs.action, filters.action.trim()));
  const from = filters.from && kstDay(filters.from);
  const to = filters.to && kstDay(filters.to, true);
  if (from) conditions.push(gte(adminAuditLogs.occurredAt, from));
  if (to) conditions.push(lt(adminAuditLogs.occurredAt, to));
  return conditions;
}

export async function listAuditLogs(filters: AuditFilters = {}) {
  if ((filters.entityId && !isAuditUuid(filters.entityId.trim())) || (filters.workspaceId && !isAuditUuid(filters.workspaceId.trim()))) {
    return { rows: [], total: 0, page: 1, pageSize: AUDIT_PAGE_SIZE, error: '대상 ID와 워크스페이스 ID는 올바른 UUID여야 합니다.' };
  }
  const conditions = auditConditions(filters);
  const where = conditions.length ? and(...conditions) : undefined;
  const db = actionDb();
  const totals = await db.select({ count: count() }).from(adminAuditLogs).where(where);
  const total = totals[0]?.count ?? 0;
  const page = Math.min(Math.max(1, Math.floor(filters.page || 1)), Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE)));
  const rows = await db.select({ log: adminAuditLogs, workspaceType: workspaces.type, bidRfpId: bids.rfpId })
      .from(adminAuditLogs)
      .leftJoin(workspaces, and(inArray(adminAuditLogs.entityType, ['workspace', 'workspace_member', 'pg_agreement_rates']), eq(adminAuditLogs.entityId, workspaces.id)))
      .leftJoin(bids, and(eq(adminAuditLogs.entityType, 'bid'), eq(adminAuditLogs.entityId, bids.id)))
      .where(where)
      .orderBy(desc(adminAuditLogs.occurredAt), desc(adminAuditLogs.id))
      .limit(AUDIT_PAGE_SIZE)
      .offset((page - 1) * AUDIT_PAGE_SIZE);
  return { rows, total, page, pageSize: AUDIT_PAGE_SIZE, error: null };
}

export async function listEntityAuditLogs(entityType: string, entityId: string) {
  return actionDb().select().from(adminAuditLogs)
    .where(and(eq(adminAuditLogs.entityType, entityType), eq(adminAuditLogs.entityId, entityId)))
    .orderBy(desc(adminAuditLogs.occurredAt), desc(adminAuditLogs.id))
    .limit(10);
}

export async function listWorkspaceAuditLogs(workspaceId: string) {
  return actionDb().select().from(adminAuditLogs)
    .where(or(
      and(inArray(adminAuditLogs.entityType, ['workspace', 'workspace_member', 'pg_agreement_rates']), eq(adminAuditLogs.entityId, workspaceId)),
      and(eq(adminAuditLogs.entityType, 'verification_application'), inArray(adminAuditLogs.entityId,
        actionDb().select({ id: verificationApplications.id }).from(verificationApplications).where(eq(verificationApplications.workspaceId, workspaceId)))),
      and(eq(adminAuditLogs.entityType, 'verification_application'), sql`${adminAuditLogs.payloadJson}->'after'->>'workspaceId' = ${workspaceId}`),
    ))
    .orderBy(desc(adminAuditLogs.occurredAt), desc(adminAuditLogs.id)).limit(10);
}
