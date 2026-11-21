import type { PGlite } from '@electric-sql/pglite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TEST_TOTP_KEY, createAdminAuthDb, insertAdmin } from '@/lib/auth/__tests__/admin-auth-db';

const mocks = vi.hoisted(() => ({ auth: vi.fn(), db: undefined as unknown, set: vi.fn() }));
vi.mock('@/auth', () => ({ auth: mocks.auth }));
vi.mock('@/lib/server/actions/auth/_shared', () => ({ actionDb: () => mocks.db }));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => undefined, set: mocks.set }),
  headers: async () => new Headers({ host: 'admin.example.com' }),
}));
vi.mock('next/navigation', () => ({ redirect: (url: string) => { throw new Error(`REDIRECT:${url}`); } }));

import { TEST_RP, enrollAdmin } from '@/lib/auth/__tests__/passkey-fixtures';
import { SoftwareAuthenticator } from '@/lib/auth/__tests__/software-authenticator';
import { ensurePendingTotpSecret } from '@/lib/auth/admin-users';
import { MFA_COOKIE_NAME, verifyMfaCookie } from '@/lib/auth/mfa-cookie';
import { preparePasskeySignIn } from '@/lib/auth/passkeys';
import { totpCodeAt, totpStep } from '@/lib/auth/totp';
import type { DB } from '@/lib/db/index';
import { passkeySignInAction, submitTotpAction } from './actions';

const email = 'ops@example.com';
const sid = '11111111-1111-4111-8111-111111111111';
let client: PGlite;
let adminId: string;

function form(code: string, callbackUrl = '/review/a1?tab=company') {
  const data = new FormData();
  data.set('code', code);
  data.set('callbackUrl', callbackUrl);
  return data;
}

beforeEach(async () => {
  vi.stubEnv('AUTH_SECRET', 'test-auth-secret');
  vi.stubEnv('ADMIN_TOTP_ENCRYPTION_KEY', TEST_TOTP_KEY);
  mocks.set.mockReset();
  const created = await createAdminAuthDb();
  client = created.client;
  mocks.db = created.db;
  adminId = await insertAdmin(client, email);
  mocks.auth.mockResolvedValue({ user: { email }, sid });
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await client.close();
});

describe('submitTotpAction', () => {
  it('enrolls, sets a 2FA cookie bound to this login, and returns to the destination', async () => {
    const secret = (await ensurePendingTotpSecret(mocks.db as DB, adminId, new Date()))!;
    const now = new Date();
    await expect(submitTotpAction(form(totpCodeAt(secret, totpStep(now))))).rejects.toThrow('REDIRECT:/review/a1?tab=company');
    expect(mocks.set).toHaveBeenCalledTimes(1);
    const [name, value, options] = mocks.set.mock.calls[0];
    expect(name).toBe(MFA_COOKIE_NAME);
    expect(options).toMatchObject({ httpOnly: true, path: '/', maxAge: 12 * 60 * 60 });
    const { rows } = await client.query<{ totp_enabled_at: Date }>('SELECT totp_enabled_at FROM admin_users');
    expect(verifyMfaCookie({ value, email, sid, enabledAt: rows[0].totp_enabled_at, now: new Date() })).toBe(true);
  });

  it('bounces a wrong code back to the 2FA page without a cookie', async () => {
    await ensurePendingTotpSecret(mocks.db as DB, adminId, new Date());
    await expect(submitTotpAction(form('abcdef'))).rejects.toThrow(
      `REDIRECT:/login/2fa?${new URLSearchParams({ callbackUrl: '/review/a1?tab=company', error: 'INVALID_CODE' })}`,
    );
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it('never redirects off-site after success', async () => {
    const secret = (await ensurePendingTotpSecret(mocks.db as DB, adminId, new Date()))!;
    await expect(submitTotpAction(form(totpCodeAt(secret, totpStep(new Date())), 'https://evil.test'))).rejects.toThrow(/^REDIRECT:\/$/);
  });

  it('requires the first factor', async () => {
    mocks.auth.mockResolvedValue({ user: { email: 'stranger@example.com' }, sid });
    await expect(submitTotpAction(form('123456'))).rejects.toThrow('REDIRECT:/login?error=AccessDenied');
  });
});

describe('passkeySignInAction', () => {
  const destination = '/review/a1?tab=company';
  let authenticator: SoftwareAuthenticator;
  let admin: Awaited<ReturnType<typeof enrollAdmin>>;

  /** A challenge as the 2FA page would render it, answered by the admin's authenticator. */
  async function answered(by: SoftwareAuthenticator = authenticator) {
    const prepared = (await preparePasskeySignIn(mocks.db as DB, admin, TEST_RP, new Date()))!;
    return {
      token: prepared.token,
      response: by.authenticate({ challenge: prepared.options.challenge, origin: TEST_RP.origin, rpID: TEST_RP.rpID }),
    };
  }

  beforeEach(async () => {
    vi.stubEnv('AUTH_URL', TEST_RP.origin);
    authenticator = new SoftwareAuthenticator();
    admin = await enrollAdmin(mocks.db as DB, { adminUserId: adminId, email, sid }, authenticator);
  });

  it('sets the same 2FA cookie a TOTP code would — bound to this login and the TOTP enrollment — and returns to the destination', async () => {
    await expect(passkeySignInAction({ ...(await answered()), callbackUrl: destination })).rejects.toThrow(`REDIRECT:${destination}`);
    expect(mocks.set).toHaveBeenCalledTimes(1);
    const [name, value, options] = mocks.set.mock.calls[0];
    expect(name).toBe(MFA_COOKIE_NAME);
    expect(options).toMatchObject({ httpOnly: true, path: '/', maxAge: 12 * 60 * 60 });
    expect(verifyMfaCookie({ value, email, sid, enabledAt: admin.totpEnabledAt, now: new Date() })).toBe(true);
    expect(verifyMfaCookie({ value, email, sid: '22222222-2222-4222-8222-222222222222', enabledAt: admin.totpEnabledAt, now: new Date() })).toBe(false);
  });

  it('returns the failure — and no cookie — for a passkey that is not this admin\'s, a replay, or garbage', async () => {
    await expect(passkeySignInAction({ ...(await answered(new SoftwareAuthenticator())), callbackUrl: destination }))
      .resolves.toEqual({ ok: false, error: 'UNKNOWN_CREDENTIAL' });
    const once = await answered();
    await expect(passkeySignInAction({ ...once, callbackUrl: destination })).rejects.toThrow(`REDIRECT:${destination}`);
    mocks.set.mockReset();
    await expect(passkeySignInAction({ ...once, callbackUrl: destination })).resolves.toEqual({ ok: false, error: 'CHALLENGE_EXPIRED' });
    await expect(passkeySignInAction({ token: 'nope', response: null, callbackUrl: destination })).resolves.toEqual({ ok: false, error: 'CHALLENGE_EXPIRED' });
    // A hand-crafted POST can send anything, including no argument at all.
    await expect(passkeySignInAction(undefined as never)).resolves.toEqual({ ok: false, error: 'CHALLENGE_EXPIRED' });
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it('never redirects off-site after success', async () => {
    await expect(passkeySignInAction({ ...(await answered()), callbackUrl: 'https://evil.test' })).rejects.toThrow(/^REDIRECT:\/$/);
  });

  it('requires the first factor, and takes the admin from the session only', async () => {
    const input = { ...(await answered()), callbackUrl: destination };
    mocks.auth.mockResolvedValue({ user: { email: 'stranger@example.com' }, sid });
    await expect(passkeySignInAction(input)).rejects.toThrow('REDIRECT:/login?error=AccessDenied');
    mocks.auth.mockResolvedValue(null);
    await expect(passkeySignInAction(input)).rejects.toThrow('REDIRECT:/login');
    // Another allowlisted admin's session cannot use this admin's challenge + response.
    await insertAdmin(client, 'other@example.com');
    mocks.auth.mockResolvedValue({ user: { email: 'other@example.com' }, sid });
    await expect(passkeySignInAction(input)).resolves.toEqual({ ok: false, error: 'CHALLENGE_EXPIRED' });
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it('is unavailable where no relying party is configured', async () => {
    const input = { ...(await answered()), callbackUrl: destination };
    vi.stubEnv('AUTH_URL', '');
    vi.stubEnv('NEXTAUTH_URL', '');
    vi.stubEnv('NODE_ENV', 'production');
    await expect(passkeySignInAction(input)).resolves.toEqual({ ok: false, error: 'PASSKEY_UNAVAILABLE' });
    expect(mocks.set).not.toHaveBeenCalled();
  });
});
