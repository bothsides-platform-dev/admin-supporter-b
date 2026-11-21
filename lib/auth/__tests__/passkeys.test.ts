import type { PGlite } from '@electric-sql/pglite';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import type { DB } from '@/lib/db/index';
import { attemptTotp, ensurePendingTotpSecret, mfaAttemptKey } from '../admin-users';
import { MAX_PASSKEYS_PER_ADMIN } from '../passkey-limits';
import {
  beginPasskeyRegistration,
  completePasskeyRegistration,
  completePasskeySignIn,
  listPasskeys,
  passkeyUserId,
  preparePasskeySignIn,
  relyingParty,
  removePasskey,
} from '../passkeys';
import { PASSKEY_CHALLENGE_TTL_MS } from '../passkey-token';
import { totpCodeAt, totpStep } from '../totp';
import { TEST_TOTP_KEY, createAdminAuthDb, insertAdmin } from './admin-auth-db';
import { SoftwareAuthenticator, type CeremonyInput } from './software-authenticator';

const rp = { rpID: 'admin.example.com', origin: 'https://admin.example.com' };
const t0 = new Date('2026-11-21T09:00:00.000Z').getTime();
/** Seconds after the test's start. Registrations are spaced ≥30s apart: each one consumes a TOTP step. */
const at = (seconds: number) => new Date(t0 + seconds * 1000);

type Admin = { adminUserId: string; email: string; sid: string; secret: string; totpEnabledAt: Date };
let client: PGlite;
let db: DB;
/** Rejections are logged for operators; captured here so the reason can be asserted and the run stays quiet. */
let warn: MockInstance<typeof console.warn>;

async function enrolledAdmin(email: string, sid = '11111111-1111-4111-8111-111111111111'): Promise<Admin> {
  const adminUserId = await insertAdmin(client, email);
  const secret = (await ensurePendingTotpSecret(db, adminUserId, at(0)))!;
  const enrolled = await attemptTotp(db, email, totpCodeAt(secret, totpStep(at(0))), at(0));
  if (!enrolled.ok) throw new Error(`enrollment failed: ${enrolled.error}`);
  return { adminUserId, email, sid, secret, totpEnabledAt: enrolled.enabledAt };
}

const ids = ({ adminUserId, email, sid }: Admin) => ({ adminUserId, email, sid });
const ceremony = (challenge: string, overrides: Partial<CeremonyInput> = {}): CeremonyInput =>
  ({ challenge, origin: rp.origin, rpID: rp.rpID, ...overrides });

function begin(admin: Admin, seconds: number, label: unknown = '회사 맥북') {
  const now = at(seconds);
  return beginPasskeyRegistration(db, { ...ids(admin), code: totpCodeAt(admin.secret, totpStep(now)), label, rp, now });
}

async function register(admin: Admin, authenticator: SoftwareAuthenticator, seconds: number, overrides: Partial<CeremonyInput> = {}) {
  const started = await begin(admin, seconds);
  if (!started.ok) throw new Error(`could not start: ${started.error}`);
  return completePasskeyRegistration(db, {
    ...ids(admin), token: started.token, label: '회사 맥북', rp, now: at(seconds + 5),
    response: authenticator.register(ceremony(started.options.challenge, overrides)),
  });
}

async function signIn(admin: Admin, authenticator: SoftwareAuthenticator, seconds: number, overrides: Partial<CeremonyInput> = {}) {
  const prepared = (await preparePasskeySignIn(db, admin, rp, at(seconds)))!;
  return completePasskeySignIn(db, {
    ...ids(admin), token: prepared.token, rp, now: at(seconds + 5),
    response: authenticator.authenticate(ceremony(prepared.options.challenge, overrides)),
  });
}

const passkeyRows = async () => (await client.query<{
  admin_user_id: string; credential_id: string; label: string; sign_count: number; backup_eligible: boolean;
  backed_up: boolean; transports: string[] | null; last_used_at: Date | null;
}>('SELECT admin_user_id, credential_id, label, sign_count, backup_eligible, backed_up, transports, last_used_at FROM admin_passkeys ORDER BY created_at')).rows;
const audit = async () => (await client.query<{ action: string; actor: string; entity_id: string }>(
  "SELECT action, actor, entity_id FROM admin_audit_logs WHERE action LIKE 'admin_user.passkey%' ORDER BY occurred_at",
)).rows;

beforeEach(async () => {
  vi.stubEnv('AUTH_SECRET', 'test-auth-secret');
  vi.stubEnv('ADMIN_TOTP_ENCRYPTION_KEY', TEST_TOTP_KEY);
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const created = await createAdminAuthDb();
  client = created.client;
  db = created.db;
});
afterEach(async () => {
  vi.unstubAllEnvs();
  warn.mockRestore();
  await client.close();
});

describe('relyingParty', () => {
  it('pins the RP ID and origin to AUTH_URL, ignoring the request host', () => {
    vi.stubEnv('AUTH_URL', 'https://admin.support-b.com/api/auth');
    expect(relyingParty('evil.example')).toEqual({ rpID: 'admin.support-b.com', origin: 'https://admin.support-b.com' });
  });

  it('falls back to a localhost request host only outside production', () => {
    vi.stubEnv('AUTH_URL', '');
    vi.stubEnv('NEXTAUTH_URL', '');
    expect(relyingParty('localhost:4242')).toEqual({ rpID: 'localhost', origin: 'http://localhost:4242' });
    expect(relyingParty('admin.support-b.com')).toBeNull();
    expect(relyingParty(null)).toBeNull();
    vi.stubEnv('NODE_ENV', 'production');
    expect(relyingParty('localhost:4242')).toBeNull();
  });

  it('offers no passkeys where no valid RP ID exists', () => {
    vi.stubEnv('AUTH_URL', 'https://192.0.2.10');
    expect(relyingParty('192.0.2.10')).toBeNull();
    vi.stubEnv('AUTH_URL', 'not a url');
    expect(relyingParty('localhost:4242')).toBeNull();
  });
});

describe('passkey registration', () => {
  it('registers a passkey after a fresh TOTP code and audits it', async () => {
    const admin = await enrolledAdmin('ops@example.com');
    const authenticator = new SoftwareAuthenticator({ backupEligible: true, backedUp: true });
    const started = await begin(admin, 60, '  회사   맥북 ');
    if (!started.ok) throw new Error(started.error);
    expect(started.options.rp).toEqual({ name: '서포트비 어드민', id: rp.rpID });
    expect(started.options.user).toEqual({ id: passkeyUserId(admin.adminUserId), name: admin.email, displayName: admin.email });
    expect(started.options.authenticatorSelection).toMatchObject({ userVerification: 'required' });
    expect(started.options.attestation).toBe('none');

    const result = await completePasskeyRegistration(db, {
      ...ids(admin), token: started.token, label: '  회사   맥북 ', rp, now: at(65),
      response: authenticator.register(ceremony(started.options.challenge)),
    });
    expect(result).toEqual({ ok: true, passkeyId: expect.any(String) });
    expect(await passkeyRows()).toEqual([{
      admin_user_id: admin.adminUserId, credential_id: authenticator.credentialId, label: '회사 맥북', sign_count: 0,
      backup_eligible: true, backed_up: true, transports: ['internal', 'hybrid'], last_used_at: null,
    }]);
    expect(await audit()).toEqual([{ action: 'admin_user.passkey_register', actor: admin.email, entity_id: admin.adminUserId }]);
    expect(await listPasskeys(db, admin.adminUserId)).toMatchObject([{ label: '회사 맥북', credentialId: authenticator.credentialId, backupEligible: true, lastUsedAt: null }]);
  });

  it('step-up: issues no challenge without a valid, unused TOTP code', async () => {
    const admin = await enrolledAdmin('ops@example.com');
    const start = (code: unknown, seconds: number) =>
      beginPasskeyRegistration(db, { ...ids(admin), code, label: '회사 맥북', rp, now: at(seconds) });
    await expect(start('000000', 60)).resolves.toEqual({ ok: false, error: 'INVALID_CODE' });
    await expect(start(undefined, 60)).resolves.toEqual({ ok: false, error: 'INVALID_CODE' });
    // The code that just signed in (same time step) cannot be reused.
    await expect(start(totpCodeAt(admin.secret, totpStep(at(0))), 1)).resolves.toEqual({ ok: false, error: 'INVALID_CODE' });
    // Wrong guesses here count against the same lock as sign-in guesses.
    await start('000000', 61);
    await start('000000', 62);
    await expect(start(totpCodeAt(admin.secret, totpStep(at(63))), 63)).resolves.toMatchObject({ ok: false, error: 'LOCKED' });
    expect(await passkeyRows()).toEqual([]);
  });

  it('purpose separation: a sign-in challenge cannot finish a registration', async () => {
    const admin = await enrolledAdmin('ops@example.com');
    await register(admin, new SoftwareAuthenticator(), 60);
    // Obtainable with the first factor alone:
    const signInChallenge = (await preparePasskeySignIn(db, admin, rp, at(120)))!;
    const planted = new SoftwareAuthenticator();
    await expect(completePasskeyRegistration(db, {
      ...ids(admin), token: signInChallenge.token, label: '공격자 기기', rp, now: at(125),
      response: planted.register(ceremony(signInChallenge.options.challenge)),
    })).resolves.toEqual({ ok: false, error: 'CHALLENGE_EXPIRED' });
    expect(await passkeyRows()).toHaveLength(1);
  });

  it('verification flags: rejects a response without user verification, from another origin, or for another RP ID', async () => {
    const admin = await enrolledAdmin('ops@example.com');
    await expect(register(admin, new SoftwareAuthenticator(), 60, { userVerified: false })).resolves.toEqual({ ok: false, error: 'PASSKEY_REJECTED' });
    await expect(register(admin, new SoftwareAuthenticator(), 120, { origin: 'https://support-b.example' })).resolves.toEqual({ ok: false, error: 'PASSKEY_REJECTED' });
    await expect(register(admin, new SoftwareAuthenticator(), 180, { rpID: 'example.com' })).resolves.toEqual({ ok: false, error: 'PASSKEY_REJECTED' });
    await expect(register(admin, new SoftwareAuthenticator(), 240, { challenge: 'YW5vdGhlci1jaGFsbGVuZ2UtMDEyMzQ1Njc4OQ' })).resolves.toEqual({ ok: false, error: 'PASSKEY_REJECTED' });
    expect(await passkeyRows()).toEqual([]);
    expect(await audit()).toEqual([]);
  });

  it('single use: one registration challenge registers one passkey', async () => {
    const admin = await enrolledAdmin('ops@example.com');
    const started = await begin(admin, 60);
    if (!started.ok) throw new Error(started.error);
    const finish = (authenticator: SoftwareAuthenticator, seconds: number) => completePasskeyRegistration(db, {
      ...ids(admin), token: started.token, label: '회사 맥북', rp, now: at(seconds),
      response: authenticator.register(ceremony(started.options.challenge)),
    });
    const first = new SoftwareAuthenticator();
    await expect(finish(first, 65)).resolves.toMatchObject({ ok: true });
    await expect(finish(new SoftwareAuthenticator(), 70)).resolves.toEqual({ ok: false, error: 'CHALLENGE_EXPIRED' });
    await expect(finish(first, 75)).resolves.toEqual({ ok: false, error: 'CHALLENGE_EXPIRED' });
    expect(await passkeyRows()).toHaveLength(1);
  });

  it('refuses a credential that is already registered, also to another admin', async () => {
    const first = await enrolledAdmin('ops@example.com');
    const second = await enrolledAdmin('other@example.com', '22222222-2222-4222-8222-222222222222');
    const authenticator = new SoftwareAuthenticator();
    await expect(register(first, authenticator, 60)).resolves.toMatchObject({ ok: true });
    await expect(register(second, authenticator, 60)).resolves.toEqual({ ok: false, error: 'PASSKEY_ALREADY_REGISTERED' });
    await expect(register(first, authenticator, 120)).resolves.toEqual({ ok: false, error: 'PASSKEY_ALREADY_REGISTERED' });
    // The browser is told not to offer an authenticator that already holds one.
    const again = await begin(first, 180);
    expect(again.ok && again.options.excludeCredentials).toEqual([
      { id: authenticator.credentialId, type: 'public-key', transports: ['internal', 'hybrid'] },
    ]);
  });

  it('enrollment binding: a challenge issued before a 2FA reset or in another login session is refused', async () => {
    const admin = await enrolledAdmin('ops@example.com');
    const started = await begin(admin, 60);
    if (!started.ok) throw new Error(started.error);
    const finish = (overrides: { sid?: string } = {}) => completePasskeyRegistration(db, {
      ...ids(admin), ...overrides, token: started.token, label: '회사 맥북', rp, now: at(65),
      response: new SoftwareAuthenticator().register(ceremony(started.options.challenge)),
    });
    await expect(finish({ sid: '99999999-9999-4999-8999-999999999999' })).resolves.toEqual({ ok: false, error: 'CHALLENGE_EXPIRED' });
    await client.query('UPDATE admin_users SET totp_enabled_at = $1', [at(62)]); // reset + re-enrolled
    await expect(finish()).resolves.toEqual({ ok: false, error: 'NOT_READY' });
    await client.query('UPDATE admin_users SET totp_enabled_at = NULL');
    await expect(finish()).resolves.toEqual({ ok: false, error: 'NOT_READY' });
    expect(await passkeyRows()).toEqual([]);
  });

  it('expires the challenge', async () => {
    const admin = await enrolledAdmin('ops@example.com');
    const started = await begin(admin, 60);
    if (!started.ok) throw new Error(started.error);
    await expect(completePasskeyRegistration(db, {
      ...ids(admin), token: started.token, label: '회사 맥북', rp, now: new Date(at(60).getTime() + PASSKEY_CHALLENGE_TTL_MS),
      response: new SoftwareAuthenticator().register(ceremony(started.options.challenge)),
    })).resolves.toEqual({ ok: false, error: 'CHALLENGE_EXPIRED' });
  });

  it('rejects an unusable label or a full list before spending a TOTP code', async () => {
    const admin = await enrolledAdmin('ops@example.com');
    for (const label of ['', '   ', 'x'.repeat(41), undefined, 42]) {
      await expect(beginPasskeyRegistration(db, {
        ...ids(admin), code: totpCodeAt(admin.secret, totpStep(at(60))), label, rp, now: at(60),
      })).resolves.toEqual({ ok: false, error: 'INVALID_LABEL' });
    }
    for (let index = 0; index < MAX_PASSKEYS_PER_ADMIN; index++) {
      await client.query(
        `INSERT INTO admin_passkeys (admin_user_id, credential_id, public_key, backup_eligible, backed_up, aaguid, label)
         VALUES ($1, $2, 'pk', false, false, '00000000-0000-0000-0000-000000000000', '기기')`,
        [admin.adminUserId, `cred-${index}`],
      );
    }
    await expect(begin(admin, 60)).resolves.toEqual({ ok: false, error: 'PASSKEY_LIMIT' });
    // Neither refusal touched the TOTP attempt counter or consumed the code.
    expect((await client.query('SELECT 1 FROM login_attempts')).rows).toEqual([]);
    await client.query("DELETE FROM admin_passkeys WHERE credential_id = 'cred-0'");
    await expect(begin(admin, 60)).resolves.toMatchObject({ ok: true });
  });
});

describe('passkey sign-in', () => {
  it('offers nothing without a passkey or without TOTP enrollment', async () => {
    const admin = await enrolledAdmin('ops@example.com');
    await expect(preparePasskeySignIn(db, admin, rp, at(60))).resolves.toBeNull();
    await register(admin, new SoftwareAuthenticator(), 60);
    await expect(preparePasskeySignIn(db, { ...admin, totpEnabledAt: null }, rp, at(120))).resolves.toBeNull();
  });

  it('accepts the admin\'s passkey and returns the enrollment time the 2FA cookie is bound to', async () => {
    const admin = await enrolledAdmin('ops@example.com');
    const other = await enrolledAdmin('other@example.com', '22222222-2222-4222-8222-222222222222');
    const authenticator = new SoftwareAuthenticator();
    await register(admin, authenticator, 60);
    await register(other, new SoftwareAuthenticator(), 60);

    const prepared = (await preparePasskeySignIn(db, admin, rp, at(120)))!;
    expect(prepared.options).toMatchObject({
      rpId: rp.rpID,
      userVerification: 'required',
      // Only this admin's credential — never another account's.
      allowCredentials: [{ id: authenticator.credentialId, type: 'public-key', transports: ['internal', 'hybrid'] }],
    });
    expect(prepared.expiresAt).toBe(at(120).getTime() + PASSKEY_CHALLENGE_TTL_MS);

    await expect(signIn(admin, authenticator, 180)).resolves.toEqual({ ok: true, enabledAt: admin.totpEnabledAt });
    const rows = await passkeyRows();
    expect(rows.find((row) => row.credential_id === authenticator.credentialId)?.last_used_at).toEqual(at(185));
    expect(rows.find((row) => row.admin_user_id === other.adminUserId)?.last_used_at).toBeNull();
  });

  it('replay: the same challenge and response succeed once', async () => {
    const admin = await enrolledAdmin('ops@example.com');
    const authenticator = new SoftwareAuthenticator();
    await register(admin, authenticator, 60);
    const prepared = (await preparePasskeySignIn(db, admin, rp, at(120)))!;
    const response = authenticator.authenticate(ceremony(prepared.options.challenge));
    const submit = (seconds: number) => completePasskeySignIn(db, { ...ids(admin), token: prepared.token, response, rp, now: at(seconds) });

    const results = await Promise.all([submit(125), submit(125)]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    // The loser is told its challenge is spent, which is what makes the page fetch a new one.
    expect(results.find((result) => !result.ok)).toEqual({ ok: false, error: 'CHALLENGE_EXPIRED' });
    await expect(submit(130)).resolves.toEqual({ ok: false, error: 'CHALLENGE_EXPIRED' });
    // A fresh challenge works again.
    await expect(signIn(admin, authenticator, 140)).resolves.toMatchObject({ ok: true });
  });

  it('a page rendered before the same passkey signed in elsewhere gets a spent challenge, then recovers with a new one', async () => {
    const admin = await enrolledAdmin('ops@example.com');
    const authenticator = new SoftwareAuthenticator();
    await register(admin, authenticator, 60);
    // Tab B renders first, tab A signs in, then tab B answers its older challenge.
    const tabB = (await preparePasskeySignIn(db, admin, rp, at(120)))!;
    await expect(signIn(admin, authenticator, 130)).resolves.toMatchObject({ ok: true });
    await expect(completePasskeySignIn(db, {
      ...ids(admin), token: tabB.token, rp, now: at(140),
      response: authenticator.authenticate(ceremony(tabB.options.challenge)),
    })).resolves.toEqual({ ok: false, error: 'CHALLENGE_EXPIRED' });
    await expect(signIn(admin, authenticator, 150)).resolves.toMatchObject({ ok: true });
  });

  it('scoped lookup: another admin\'s passkey does not exist for this admin', async () => {
    const admin = await enrolledAdmin('ops@example.com');
    const other = await enrolledAdmin('other@example.com', '22222222-2222-4222-8222-222222222222');
    const mine = new SoftwareAuthenticator();
    const theirs = new SoftwareAuthenticator();
    await register(admin, mine, 60);
    await register(other, theirs, 60);
    // A genuine, correctly signed response for this admin's challenge — by someone else's passkey.
    await expect(signIn(admin, theirs, 120)).resolves.toEqual({ ok: false, error: 'UNKNOWN_CREDENTIAL' });
    await expect(signIn(admin, new SoftwareAuthenticator(), 130)).resolves.toEqual({ ok: false, error: 'UNKNOWN_CREDENTIAL' });
    expect((await passkeyRows()).every((row) => row.last_used_at === null)).toBe(true);
  });

  it('verification flags: rejects a response without user verification, from another origin, or for another RP ID', async () => {
    const admin = await enrolledAdmin('ops@example.com');
    const authenticator = new SoftwareAuthenticator();
    await register(admin, authenticator, 60);
    await expect(signIn(admin, authenticator, 120, { userVerified: false })).resolves.toEqual({ ok: false, error: 'PASSKEY_REJECTED' });
    await expect(signIn(admin, authenticator, 130, { origin: 'https://support-b.example' })).resolves.toEqual({ ok: false, error: 'PASSKEY_REJECTED' });
    await expect(signIn(admin, authenticator, 140, { rpID: 'example.com' })).resolves.toEqual({ ok: false, error: 'PASSKEY_REJECTED' });
    await expect(signIn(admin, authenticator, 150, { challenge: 'YW5vdGhlci1jaGFsbGVuZ2UtMDEyMzQ1Njc4OQ' })).resolves.toEqual({ ok: false, error: 'PASSKEY_REJECTED' });
    expect((await passkeyRows())[0].last_used_at).toBeNull();
    // The admin sees one generic error; the operator's log says which check failed.
    expect(warn.mock.calls.map(([prefix, reason]) => `${prefix} ${reason}`)).toEqual([
      expect.stringMatching(/^passkey sign-in rejected: .*user (could not be )?verif/i),
      expect.stringMatching(/^passkey sign-in rejected: .*origin/i),
      expect.stringMatching(/^passkey sign-in rejected: .*RP ID/i),
      expect.stringMatching(/^passkey sign-in rejected: .*challenge/i),
    ]);
  });

  it('rejects a forged signature and malformed input', async () => {
    const admin = await enrolledAdmin('ops@example.com');
    const authenticator = new SoftwareAuthenticator();
    await register(admin, authenticator, 60);
    const prepared = (await preparePasskeySignIn(db, admin, rp, at(120)))!;
    const genuine = authenticator.authenticate(ceremony(prepared.options.challenge));
    // Same credential id, signed with a different private key.
    const forged = { ...genuine, response: { ...genuine.response, signature: new SoftwareAuthenticator().authenticate(ceremony(prepared.options.challenge)).response.signature } };
    const submit = (response: unknown) => completePasskeySignIn(db, { ...ids(admin), token: prepared.token, response, rp, now: at(125) });
    await expect(submit(forged)).resolves.toEqual({ ok: false, error: 'PASSKEY_REJECTED' });
    for (const response of [null, 'x', {}, { ...genuine, type: 'password' }, { ...genuine, response: { ...genuine.response, signature: 'not base64url!' } }]) {
      await expect(submit(response)).resolves.toEqual({ ok: false, error: 'PASSKEY_REJECTED' });
    }
    await expect(submit(genuine)).resolves.toMatchObject({ ok: true });
  });

  it('ignores what a browser or the JSON polyfill adds around the fields that matter', async () => {
    const admin = await enrolledAdmin('ops@example.com');
    const authenticator = new SoftwareAuthenticator();
    // Registration as older browsers serialize it: no attachment, empty transports, extra response fields.
    const started = await begin(admin, 60);
    if (!started.ok) throw new Error(started.error);
    const attestation = authenticator.register(ceremony(started.options.challenge));
    await expect(completePasskeyRegistration(db, {
      ...ids(admin), token: started.token, label: '회사 맥북', rp, now: at(65),
      response: {
        ...attestation, authenticatorAttachment: undefined, clientExtensionResults: { credProps: { rk: true } },
        response: { ...attestation.response, transports: [], publicKeyAlgorithm: -7, authenticatorData: '' },
      },
    })).resolves.toMatchObject({ ok: true });
    expect((await passkeyRows())[0].transports).toBeNull();

    // Sign-in with an empty user handle and a null attachment (non-discoverable credentials, polyfilled toJSON).
    const prepared = (await preparePasskeySignIn(db, admin, rp, at(120)))!;
    const assertion = authenticator.authenticate(ceremony(prepared.options.challenge));
    await expect(completePasskeySignIn(db, {
      ...ids(admin), token: prepared.token, rp, now: at(125),
      response: { ...assertion, authenticatorAttachment: null, response: { ...assertion.response, userHandle: '' } },
    })).resolves.toMatchObject({ ok: true });
  });

  it('enrollment binding: refuses once TOTP was reset, and a challenge from another login session', async () => {
    const admin = await enrolledAdmin('ops@example.com');
    const authenticator = new SoftwareAuthenticator();
    await register(admin, authenticator, 60);
    const prepared = (await preparePasskeySignIn(db, admin, rp, at(120)))!;
    const submit = (overrides: { sid?: string } = {}) => completePasskeySignIn(db, {
      ...ids(admin), ...overrides, token: prepared.token, rp, now: at(125),
      response: authenticator.authenticate(ceremony(prepared.options.challenge)),
    });
    await expect(submit({ sid: '99999999-9999-4999-8999-999999999999' })).resolves.toEqual({ ok: false, error: 'CHALLENGE_EXPIRED' });
    // The passkey row is kept here on purpose: the refusal must come from the enrollment check itself.
    await client.query('UPDATE admin_users SET totp_enabled_at = $1', [at(122)]);
    await expect(submit()).resolves.toEqual({ ok: false, error: 'NOT_READY' });
    await client.query('UPDATE admin_users SET totp_enabled_at = NULL');
    await expect(submit()).resolves.toEqual({ ok: false, error: 'NOT_READY' });
    expect((await passkeyRows())[0].last_used_at).toBeNull();
  });

  it('expires the challenge', async () => {
    const admin = await enrolledAdmin('ops@example.com');
    const authenticator = new SoftwareAuthenticator();
    await register(admin, authenticator, 60);
    const prepared = (await preparePasskeySignIn(db, admin, rp, at(120)))!;
    await expect(completePasskeySignIn(db, {
      ...ids(admin), token: prepared.token, rp, now: new Date(prepared.expiresAt),
      response: authenticator.authenticate(ceremony(prepared.options.challenge)),
    })).resolves.toEqual({ ok: false, error: 'CHALLENGE_EXPIRED' });
  });

  it('tracks the signature counter and refuses a rollback (cloned authenticator)', async () => {
    const admin = await enrolledAdmin('ops@example.com');
    const authenticator = new SoftwareAuthenticator();
    await register(admin, authenticator, 60, { signCount: 5 });
    expect((await passkeyRows())[0].sign_count).toBe(5);
    await expect(signIn(admin, authenticator, 120, { signCount: 3 })).resolves.toEqual({ ok: false, error: 'PASSKEY_REJECTED' });
    await expect(signIn(admin, authenticator, 130, { signCount: 9 })).resolves.toMatchObject({ ok: true });
    expect((await passkeyRows())[0].sign_count).toBe(9);
  });

  it('is independent of the TOTP attempt lock', async () => {
    const admin = await enrolledAdmin('ops@example.com');
    const authenticator = new SoftwareAuthenticator();
    await register(admin, authenticator, 60);
    // Someone holding only the first factor keeps the code path locked.
    await client.query('INSERT INTO login_attempts (key, count, locked_until, updated_at) VALUES ($1, 5, $2, $3)', [mfaAttemptKey(admin.email), at(900), at(100)]);
    await expect(signIn(admin, authenticator, 120)).resolves.toMatchObject({ ok: true });
    expect((await client.query<{ count: number; locked_until: Date }>('SELECT count, locked_until FROM login_attempts')).rows).toEqual([{ count: 5, locked_until: at(900) }]);
  });
});

describe('removePasskey', () => {
  it('removes one of the admin\'s own passkeys and audits it', async () => {
    const admin = await enrolledAdmin('ops@example.com');
    const registered = await register(admin, new SoftwareAuthenticator(), 60);
    if (!registered.ok) throw new Error(registered.error);
    await expect(removePasskey(db, { ...ids(admin), passkeyId: registered.passkeyId })).resolves.toEqual({ ok: true });
    expect(await passkeyRows()).toEqual([]);
    expect((await audit()).map((row) => row.action)).toEqual(['admin_user.passkey_register', 'admin_user.passkey_remove']);
    await expect(removePasskey(db, { ...ids(admin), passkeyId: registered.passkeyId })).resolves.toEqual({ ok: false, error: 'NOT_FOUND' });
  });

  it('cannot remove another admin\'s passkey', async () => {
    const admin = await enrolledAdmin('ops@example.com');
    const other = await enrolledAdmin('other@example.com', '22222222-2222-4222-8222-222222222222');
    const registered = await register(other, new SoftwareAuthenticator(), 60);
    if (!registered.ok) throw new Error(registered.error);
    await expect(removePasskey(db, { ...ids(admin), passkeyId: registered.passkeyId })).resolves.toEqual({ ok: false, error: 'NOT_FOUND' });
    await expect(removePasskey(db, { ...ids(admin), passkeyId: 'not-a-uuid' })).resolves.toEqual({ ok: false, error: 'NOT_FOUND' });
    expect(await passkeyRows()).toHaveLength(1);
  });
});
