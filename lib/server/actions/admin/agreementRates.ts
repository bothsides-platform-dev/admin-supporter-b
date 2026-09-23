'use server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireAdminPermission } from '@/lib/auth/admin-session';
import { actionDb } from '@/lib/server/actions/auth/_shared';
import { pgAgreementRates, workspaces, adminAuditLogs } from '@/lib/db/schema';
import { AgreementRatesSchema } from '@/lib/agreement-rates';

const Input = z
  .object({
    pgWsId: z.string().uuid(),
    version: z.number().int().nonnegative(),
    rates: AgreementRatesSchema,
  })
  .strict();
export async function saveAgreementRatesAction(
  input: unknown,
): Promise<{ ok: true; version: number } | { ok: false; error: string }> {
  const session = await requireAdminPermission('agreement_rates.edit');
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };
  const { pgWsId, version, rates } = parsed.data;
  const result = await actionDb().transaction(async (tx) => {
    // Same row lock as bidit AgreementService.prepare: a send snapshots one policy.
    const [pg] = await tx
      .select({ type: workspaces.type })
      .from(workspaces)
      .where(eq(workspaces.id, pgWsId))
      .for('update');
    if (pg?.type !== 'pg') return { ok: false as const, error: 'PG_WORKSPACE_REQUIRED' };
    const [before] = await tx
      .select()
      .from(pgAgreementRates)
      .where(eq(pgAgreementRates.pgWsId, pgWsId));
    if ((before?.version ?? 0) !== version) return { ok: false as const, error: 'RATES_CHANGED' };
    const after = { pgWsId, version: version + 1, rates, updatedAt: new Date() };
    await tx
      .insert(pgAgreementRates)
      .values(after)
      .onConflictDoUpdate({ target: pgAgreementRates.pgWsId, set: after });
    await tx
      .insert(adminAuditLogs)
      .values({
        actor: session.adminId,
        action: 'agreement_rates.saved',
        entityType: 'pg_agreement_rates',
        entityId: pgWsId,
        payloadJson: { before: before ?? {}, after },
      });
    return { ok: true as const, version: after.version };
  });
  if (result.ok) revalidatePath('/agreement-rates');
  return result;
}
