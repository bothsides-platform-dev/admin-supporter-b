import { asc, and, eq } from 'drizzle-orm';
import { adminAuditLogs } from '@/lib/db/schema';
import { actionDb } from '@/lib/server/actions/auth/_shared';

/** Full chronological decision trail for one application. */
export async function getApplicationReviewHistory(
  applicationId: string,
  db: ReturnType<typeof actionDb> = actionDb(),
) {
  return db.select().from(adminAuditLogs)
    .where(and(
      eq(adminAuditLogs.entityType, 'verification_application'),
      eq(adminAuditLogs.entityId, applicationId),
    ))
    .orderBy(asc(adminAuditLogs.occurredAt), asc(adminAuditLogs.id));
}
