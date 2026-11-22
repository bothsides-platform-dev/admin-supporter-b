'use server';

import { eq, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { rfps, adminAuditLogs } from '@/lib/db/schema';
import { requireAdminPermission } from '@/lib/auth/admin-session';
import { actionDb } from '@/lib/server/actions/auth/_shared';

type DB = ReturnType<typeof actionDb>;
type Result = { ok: true; newDeadline: Date } | { ok: false; error: string };

export async function extendRfpDeadlineAction(
  db: DB = actionDb(),
  rfpId: string,
  days = 7,
): Promise<Result> {
  if (!Number.isInteger(days) || days < 1 || days > 30) return { ok: false, error: 'INVALID_DAYS' };

  const session = await requireAdminPermission('rfp.manage');
  const newDeadline = await db.transaction(async (tx) => {
    const [rfp] = await tx.select({ deadline: rfps.deadline }).from(rfps)
      .where(eq(rfps.id, rfpId)).for('update');
    if (!rfp) return null;

    const deadline = new Date(new Date(rfp.deadline).getTime() + days * 86_400_000);
    await tx.update(rfps).set({ deadline }).where(eq(rfps.id, rfpId));
    // Keep the missed promise even when the buyer gets a new deadline.
    await tx.execute(sql`
      update pg_consultation_cases c
      set late_quote_due = coalesce(c.late_quote_due,
            case when c.quoted_at is null and c.quote_due <= now() then c.quote_due end),
          quote_due = ${deadline.toISOString()}::timestamptz
      from rfp_pg_reviews r
      where r.id = c.review_id and r.rfp_id = ${rfpId}
        and r.status in ('requested','reviewing','quoted')
    `);
    await tx.insert(adminAuditLogs).values({
      actor: session.adminId,
      action: 'rfp.extend',
      entityType: 'rfp',
      entityId: rfpId,
      payloadJson: {
        before: { deadline: rfp.deadline },
        after: { deadline },
        reason: `+${days}일 연장`,
      },
    });
    return deadline;
  });
  if (!newDeadline) return { ok: false, error: 'NOT_FOUND' };

  revalidatePath(`/rfps/${rfpId}`);
  revalidatePath('/rfps');
  revalidatePath('/consultations');
  return { ok: true, newDeadline };
}
