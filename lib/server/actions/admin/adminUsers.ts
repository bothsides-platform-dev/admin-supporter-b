'use server';

import { asc, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { adminAuditLogs, adminUsers, loginAttempts } from '@/lib/db/schema';
import { requireAdminPermission } from '@/lib/auth/admin-session';
import { mfaAttemptKey, normalizeAdminEmail } from '@/lib/auth/admin-users';
import { actionDb, isUniqueViolation } from '@/lib/server/actions/auth/_shared';

type Result = { ok: true } | { ok: false; error: string };

const emailSchema = z.email().max(254);

/** Allowlist a Google email. The new admin enrolls TOTP on first login. */
export async function addAdminUserAction(rawEmail: string): Promise<Result> {
  const session = await requireAdminPermission('admin.manage');
  const email = normalizeAdminEmail(String(rawEmail ?? ''));
  if (!emailSchema.safeParse(email).success) return { ok: false, error: 'INVALID_EMAIL' };

  try {
    await actionDb().transaction(async (tx) => {
      const [row] = await tx
        .insert(adminUsers)
        .values({ email, createdBy: session.adminId })
        .returning({ id: adminUsers.id });
      await tx.insert(adminAuditLogs).values({
        actor: session.adminId,
        action: 'admin_user.create',
        entityType: 'admin_user',
        entityId: row.id,
        payloadJson: { after: { email } },
      });
    });
  } catch (err) {
    if (isUniqueViolation(err)) return { ok: false, error: 'ADMIN_ALREADY_EXISTS' };
    throw err;
  }
  revalidatePath('/admins');
  return { ok: true };
}

/**
 * Remove an admin. Takes effect on their next request (requireAdminSession
 * re-reads the table). Self-removal and removing the last account are refused;
 * every row is locked first so concurrent removals cannot both pass the count.
 */
export async function removeAdminUserAction(adminUserId: string): Promise<Result> {
  const session = await requireAdminPermission('admin.manage');
  if (adminUserId === session.adminUserId) return { ok: false, error: 'CANNOT_CHANGE_SELF' };

  const result = await actionDb().transaction(async (tx) => {
    const rows = await tx
      .select({ id: adminUsers.id, email: adminUsers.email, totpEnabledAt: adminUsers.totpEnabledAt })
      .from(adminUsers)
      .orderBy(asc(adminUsers.id))
      .for('update');
    const target = rows.find((row) => row.id === adminUserId);
    if (!target) return { ok: false as const, error: 'NOT_FOUND' };
    if (rows.length <= 1) return { ok: false as const, error: 'LAST_ADMIN_ACCOUNT' };
    await tx.delete(adminUsers).where(eq(adminUsers.id, adminUserId));
    await tx.delete(loginAttempts).where(eq(loginAttempts.key, mfaAttemptKey(target.email)));
    await tx.insert(adminAuditLogs).values({
      actor: session.adminId,
      action: 'admin_user.delete',
      entityType: 'admin_user',
      entityId: adminUserId,
      payloadJson: { before: { email: target.email, totpEnabledAt: target.totpEnabledAt?.toISOString() ?? null } },
    });
    return { ok: true as const };
  });
  if (!result.ok) return result;
  revalidatePath('/admins');
  return { ok: true };
}

/**
 * Lost-phone recovery: clear another admin's TOTP so they re-enroll at next
 * login. Clearing totp_enabled_at also invalidates every 2FA cookie they hold
 * (the cookie is bound to it), and the attempt lock is lifted.
 */
export async function resetAdminTotpAction(adminUserId: string): Promise<Result> {
  const session = await requireAdminPermission('admin.manage');
  if (adminUserId === session.adminUserId) return { ok: false, error: 'CANNOT_CHANGE_SELF' };

  const result = await actionDb().transaction(async (tx) => {
    const [target] = await tx
      .select({ email: adminUsers.email, totpEnabledAt: adminUsers.totpEnabledAt })
      .from(adminUsers)
      .where(eq(adminUsers.id, adminUserId))
      .for('update');
    if (!target) return { ok: false as const, error: 'NOT_FOUND' };
    await tx
      .update(adminUsers)
      .set({ totpSecretEnc: null, totpEnabledAt: null, totpLastUsedStep: null, updatedAt: new Date() })
      .where(eq(adminUsers.id, adminUserId));
    await tx.delete(loginAttempts).where(eq(loginAttempts.key, mfaAttemptKey(target.email)));
    await tx.insert(adminAuditLogs).values({
      actor: session.adminId,
      action: 'admin_user.totp_reset',
      entityType: 'admin_user',
      entityId: adminUserId,
      payloadJson: {
        before: { email: target.email, totpEnabledAt: target.totpEnabledAt?.toISOString() ?? null },
        after: { totpEnabledAt: null },
      },
    });
    return { ok: true as const };
  });
  if (!result.ok) return result;
  revalidatePath('/admins');
  return { ok: true };
}
