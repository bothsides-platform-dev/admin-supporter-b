import type { PGlite } from '@electric-sql/pglite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DB } from '@/lib/db/index';
import {
  MFA_LOCK_DURATION_MS, MFA_LOCK_THRESHOLD, attemptTotp, ensurePendingTotpSecret, readMfaLock, reserveMfaAttempt,
} from '../admin-users';
import { totpCodeAt, totpStep } from '../totp';
import { TEST_TOTP_KEY, createAdminAuthDb, insertAdmin } from './admin-auth-db';

const email = 'ops@example.com';
const t0 = new Date('2026-11-15T09:00:00Z');
const plus = (ms: number) => new Date(t0.getTime() + ms);
let client: PGlite;
let db: DB;
let adminId: string;

beforeEach(async () => {
  vi.stubEnv('ADMIN_TOTP_ENCRYPTION_KEY', TEST_TOTP_KEY);
  ({ client, db } = await createAdminAuthDb());
  adminId = await insertAdmin(client, email);
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await client.close();
});

describe('2FA attempt throttle', () => {
  it(`admits ${MFA_LOCK_THRESHOLD} attempts, then locks for the lock window`, async () => {
    for (let i = 0; i < MFA_LOCK_THRESHOLD; i++) expect((await reserveMfaAttempt(db, email, t0)).allowed).toBe(true);
    const blocked = await reserveMfaAttempt(db, email, plus(1000));
    expect(blocked.allowed).toBe(false);
    expect(blocked.lockedUntil?.getTime()).toBe(t0.getTime() + MFA_LOCK_DURATION_MS);
    expect(await readMfaLock(db, email, plus(1000))).toEqual(blocked.lockedUntil);
    // lock elapsed → fresh window
    expect(await readMfaLock(db, email, plus(MFA_LOCK_DURATION_MS))).toBeNull();
    expect((await reserveMfaAttempt(db, email, plus(MFA_LOCK_DURATION_MS))).allowed).toBe(true);
    const { rows } = await client.query<{ count: number }>('SELECT count FROM login_attempts');
    expect(rows).toEqual([{ count: 1 }]);
  });

  it('serialises concurrent guesses even before the counter row exists', async () => {
    const results = await Promise.all(Array.from({ length: 10 }, () => reserveMfaAttempt(db, email, t0)));
    expect(results.filter((r) => r.allowed)).toHaveLength(MFA_LOCK_THRESHOLD);
  });

  it('forgets a stale, unlocked counter after a lock window of inactivity', async () => {
    for (let i = 0; i < MFA_LOCK_THRESHOLD - 1; i++) await reserveMfaAttempt(db, email, t0);
    await reserveMfaAttempt(db, email, plus(MFA_LOCK_DURATION_MS + 1));
    const { rows } = await client.query<{ count: number; locked_until: Date | null }>('SELECT count, locked_until FROM login_attempts');
    expect(rows).toEqual([{ count: 1, locked_until: null }]);
  });

  it('uses its own key namespace, separate from the main app login throttle', async () => {
    await client.query(`INSERT INTO login_attempts (key, count) VALUES ('email:${email}', 9)`);
    expect((await reserveMfaAttempt(db, email, t0)).allowed).toBe(true);
    const { rows } = await client.query<{ key: string; count: number }>('SELECT key, count FROM login_attempts ORDER BY key');
    expect(rows).toEqual([{ key: `admin-2fa:${email}`, count: 1 }, { key: `email:${email}`, count: 9 }]);
  });
});

describe('enrollment and sign-in codes', () => {
  async function enroll() {
    const secret = (await ensurePendingTotpSecret(db, adminId, t0))!;
    const result = await attemptTotp(db, email, totpCodeAt(secret, totpStep(t0)), t0);
    return { secret, result };
  }

  it('keeps the same pending secret across reloads and stores it encrypted', async () => {
    const first = await ensurePendingTotpSecret(db, adminId, t0);
    const second = await ensurePendingTotpSecret(db, adminId, plus(5000));
    expect(first).toMatch(/^[A-Z2-7]{32}$/);
    expect(second).toBe(first);
    const { rows } = await client.query<{ totp_secret_enc: string }>('SELECT totp_secret_enc FROM admin_users');
    expect(rows[0].totp_secret_enc).toMatch(/^v1:/);
    expect(rows[0].totp_secret_enc).not.toContain(first!);
  });

  it('enrolls on the first correct code and records it in the audit log', async () => {
    const secret = (await ensurePendingTotpSecret(db, adminId, t0))!;
    expect(await attemptTotp(db, email, '000000' === totpCodeAt(secret, totpStep(t0)) ? '111111' : '000000', t0))
      .toEqual({ ok: false, error: 'INVALID_CODE' });
    const result = await attemptTotp(db, email, totpCodeAt(secret, totpStep(t0)), t0);
    expect(result).toEqual({ ok: true, enrolled: true, enabledAt: t0 });
    const { rows } = await client.query<{ action: string; actor: string; entity_id: string }>('SELECT action, actor, entity_id FROM admin_audit_logs');
    expect(rows).toEqual([{ action: 'admin_user.totp_enroll', actor: email, entity_id: adminId }]);
    // success clears the throttle (the failed attempt above no longer counts)
    expect((await client.query('SELECT * FROM login_attempts')).rows).toEqual([]);
    expect(await ensurePendingTotpSecret(db, adminId, t0)).toBeNull();
  });

  it('signs in with a later code but never accepts the same code twice', async () => {
    const { secret } = await enroll();
    const replay = await attemptTotp(db, email, totpCodeAt(secret, totpStep(t0)), plus(1000));
    expect(replay).toEqual({ ok: false, error: 'INVALID_CODE' });
    const next = await attemptTotp(db, email, totpCodeAt(secret, totpStep(t0) + 1), plus(30_000));
    expect(next).toEqual({ ok: true, enrolled: false, enabledAt: t0 });
    // an older (but still in-window) step is also refused once a newer one was used
    expect(await attemptTotp(db, email, totpCodeAt(secret, totpStep(t0)), plus(30_000))).toEqual({ ok: false, error: 'INVALID_CODE' });
  });

  it('refuses even a correct code while locked', async () => {
    const { secret } = await enroll();
    for (let i = 0; i < MFA_LOCK_THRESHOLD; i++) await attemptTotp(db, email, 'abcdef', plus(1000));
    const result = await attemptTotp(db, email, totpCodeAt(secret, totpStep(plus(60_000))), plus(60_000));
    expect(result).toMatchObject({ ok: false, error: 'LOCKED' });
  });

  it('is NOT_READY without a secret (e.g. right after a reset)', async () => {
    expect(await attemptTotp(db, email, '123456', t0)).toEqual({ ok: false, error: 'NOT_READY' });
  });

  it('does not sign in against a secret that was reset and re-issued meanwhile', async () => {
    const { secret } = await enroll();
    await client.query('UPDATE admin_users SET totp_secret_enc = NULL, totp_enabled_at = NULL, totp_last_used_step = NULL');
    const fresh = (await ensurePendingTotpSecret(db, adminId, plus(60_000)))!;
    expect(fresh).not.toBe(secret);
    expect(await attemptTotp(db, email, totpCodeAt(secret, totpStep(plus(60_000))), plus(60_000)))
      .toEqual({ ok: false, error: 'INVALID_CODE' });
  });
});
