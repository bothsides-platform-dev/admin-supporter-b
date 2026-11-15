import { and, asc, eq, isNotNull, isNull, lt, or, sql } from 'drizzle-orm';
import { adminAuditLogs, adminUsers, loginAttempts } from '@/lib/db/schema';
import type { DB } from '@/lib/db/index';
import { decryptTotpSecret, encryptTotpSecret } from './totp-crypto';
import { generateTotpSecret, verifyTotp } from './totp';

/**
 * Admin console accounts (allowlist) + TOTP state, stored in the shared DB
 * table `admin_users` (DDL owned by bidit). Emails are stored lowercase.
 */
export type AdminUserRow = typeof adminUsers.$inferSelect;
type Tx = Parameters<Parameters<DB['transaction']>[0]>[0];
type Queryable = DB | Tx;

export function normalizeAdminEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export async function findAdminByEmail(db: Queryable, email: string): Promise<AdminUserRow | null> {
  const [row] = await db.select().from(adminUsers).where(eq(adminUsers.email, normalizeAdminEmail(email))).limit(1);
  return row ?? null;
}

export async function isAllowlistedAdmin(db: Queryable, email: string): Promise<boolean> {
  return (await findAdminByEmail(db, email)) !== null;
}

export type AdminUserListRow = Pick<AdminUserRow, 'id' | 'email' | 'totpEnabledAt' | 'createdAt' | 'createdBy'>;

export async function listAdminUsers(db: Queryable): Promise<AdminUserListRow[]> {
  return db
    .select({
      id: adminUsers.id,
      email: adminUsers.email,
      totpEnabledAt: adminUsers.totpEnabledAt,
      createdAt: adminUsers.createdAt,
      createdBy: adminUsers.createdBy,
    })
    .from(adminUsers)
    .orderBy(asc(adminUsers.createdAt), asc(adminUsers.email));
}

// ── TOTP enrollment ────────────────────────────────────────────────────────

/**
 * Returns the not-yet-confirmed secret for an unenrolled admin, creating it on
 * first call. The conditional UPDATE makes this idempotent: reloading the setup
 * page (or two tabs) keeps showing the same QR instead of invalidating a code
 * the admin already scanned. Returns null once enrolled.
 */
export async function ensurePendingTotpSecret(db: Queryable, adminUserId: string, now: Date): Promise<string | null> {
  const candidate = generateTotpSecret();
  await db
    .update(adminUsers)
    .set({ totpSecretEnc: encryptTotpSecret(candidate, adminUserId), updatedAt: now })
    .where(and(eq(adminUsers.id, adminUserId), isNull(adminUsers.totpSecretEnc), isNull(adminUsers.totpEnabledAt)));
  const [row] = await db
    .select({ secret: adminUsers.totpSecretEnc, enabledAt: adminUsers.totpEnabledAt })
    .from(adminUsers)
    .where(eq(adminUsers.id, adminUserId))
    .limit(1);
  if (!row || row.enabledAt || !row.secret) return null;
  return decryptTotpSecret(row.secret, adminUserId);
}

// ── Attempt throttling (shared login_attempts table) ──────────────────────

export const MFA_LOCK_THRESHOLD = 5;
export const MFA_LOCK_DURATION_MS = 15 * 60 * 1000;

/** Distinct prefix from the main app's `email:` / `ip:` keys. */
export function mfaAttemptKey(email: string): string {
  return `admin-2fa:${normalizeAdminEmail(email)}`;
}

export type MfaAttemptAdmission = { allowed: boolean; lockedUntil: Date | null };

/**
 * Reserve one attempt BEFORE checking the code. A single upsert serialises
 * concurrent guesses on the row lock — including the very first ones, when no
 * row exists yet — so at most MFA_LOCK_THRESHOLD codes are ever compared per
 * lock window. The attempt that reaches the threshold is still admitted and
 * starts the lock; later attempts are rejected without comparing. An expired
 * lock, or a counter idle for a whole lock window, starts over.
 */
export async function reserveMfaAttempt(db: Queryable, email: string, now: Date): Promise<MfaAttemptAdmission> {
  const nowIso = now.toISOString();
  const staleIso = new Date(now.getTime() - MFA_LOCK_DURATION_MS).toISOString();
  const lockIso = new Date(now.getTime() + MFA_LOCK_DURATION_MS).toISOString();
  const restart = sql`(login_attempts.locked_until IS NOT NULL AND login_attempts.locked_until <= ${nowIso}::timestamptz)
    OR (login_attempts.locked_until IS NULL AND login_attempts.updated_at <= ${staleIso}::timestamptz)`;
  const [row] = await db
    .insert(loginAttempts)
    .values({ key: mfaAttemptKey(email), count: 1, lockedUntil: null, updatedAt: now })
    .onConflictDoUpdate({
      target: loginAttempts.key,
      set: {
        count: sql`CASE WHEN ${restart} THEN 1 ELSE login_attempts.count + 1 END`,
        lockedUntil: sql`CASE
          WHEN ${restart} THEN NULL
          WHEN login_attempts.locked_until IS NOT NULL THEN login_attempts.locked_until
          WHEN login_attempts.count + 1 >= ${MFA_LOCK_THRESHOLD} THEN ${lockIso}::timestamptz
          ELSE NULL END`,
        updatedAt: sql`${nowIso}::timestamptz`,
      },
    })
    .returning({ count: loginAttempts.count, lockedUntil: loginAttempts.lockedUntil });
  return { allowed: row.count <= MFA_LOCK_THRESHOLD, lockedUntil: row.lockedUntil };
}

/** Read-only lock status for rendering the 2FA page. */
export async function readMfaLock(db: Queryable, email: string, now: Date): Promise<Date | null> {
  const [row] = await db
    .select({ lockedUntil: loginAttempts.lockedUntil })
    .from(loginAttempts)
    .where(eq(loginAttempts.key, mfaAttemptKey(email)))
    .limit(1);
  return row?.lockedUntil && row.lockedUntil.getTime() > now.getTime() ? row.lockedUntil : null;
}

export async function clearMfaAttempts(db: Queryable, email: string): Promise<void> {
  await db.delete(loginAttempts).where(eq(loginAttempts.key, mfaAttemptKey(email)));
}

// ── Code submission (setup confirm or sign-in verify) ─────────────────────

export type TotpAttemptResult =
  | { ok: true; enabledAt: Date; enrolled: boolean }
  | { ok: false; error: 'LOCKED'; lockedUntil: Date | null }
  | { ok: false; error: 'INVALID_CODE' | 'NOT_READY' };

/**
 * Checks a submitted code against the admin's CURRENT row. Unenrolled → the
 * code confirms the pending secret and enrolls; enrolled → the code signs in.
 * The matched time step is consumed with a conditional UPDATE so the same code
 * cannot be replayed (also not across concurrent requests).
 */
export async function attemptTotp(
  db: DB,
  email: string,
  code: unknown,
  now: Date,
): Promise<TotpAttemptResult> {
  const admission = await reserveMfaAttempt(db, email, now);
  if (!admission.allowed) return { ok: false, error: 'LOCKED', lockedUntil: admission.lockedUntil };

  const admin = await findAdminByEmail(db, email);
  if (!admin?.totpSecretEnc) return { ok: false, error: 'NOT_READY' };
  const step = verifyTotp(decryptTotpSecret(admin.totpSecretEnc, admin.id), code, now);
  if (step === null) return { ok: false, error: 'INVALID_CODE' };

  const notReplayed = or(isNull(adminUsers.totpLastUsedStep), lt(adminUsers.totpLastUsedStep, step));
  const result = await db.transaction(async (tx) => {
    if (admin.totpEnabledAt) {
      const [row] = await tx
        .update(adminUsers)
        .set({ totpLastUsedStep: step, updatedAt: now })
        .where(and(
          eq(adminUsers.id, admin.id),
          isNotNull(adminUsers.totpEnabledAt),
          eq(adminUsers.totpSecretEnc, admin.totpSecretEnc!),
          notReplayed,
        ))
        .returning({ enabledAt: adminUsers.totpEnabledAt });
      return row?.enabledAt ? { enabledAt: row.enabledAt, enrolled: false } : null;
    }
    const [row] = await tx
      .update(adminUsers)
      .set({ totpEnabledAt: now, totpLastUsedStep: step, updatedAt: now })
      .where(and(
        eq(adminUsers.id, admin.id),
        isNull(adminUsers.totpEnabledAt),
        eq(adminUsers.totpSecretEnc, admin.totpSecretEnc!),
        notReplayed,
      ))
      .returning({ enabledAt: adminUsers.totpEnabledAt });
    if (!row?.enabledAt) return null;
    await tx.insert(adminAuditLogs).values({
      actor: admin.email,
      action: 'admin_user.totp_enroll',
      entityType: 'admin_user',
      entityId: admin.id,
      payloadJson: { after: { totpEnabledAt: row.enabledAt.toISOString() } },
    });
    return { enabledAt: row.enabledAt, enrolled: true };
  });
  if (!result) return { ok: false, error: 'INVALID_CODE' };

  await clearMfaAttempts(db, email);
  return { ok: true, ...result };
}
