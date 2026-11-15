import type { PGlite } from '@electric-sql/pglite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TEST_TOTP_KEY, createAdminAuthDb, insertAdmin } from '@/lib/auth/__tests__/admin-auth-db';

const mocks = vi.hoisted(() => ({ auth: vi.fn(), db: undefined as unknown, set: vi.fn() }));
vi.mock('@/auth', () => ({ auth: mocks.auth }));
vi.mock('@/lib/server/actions/auth/_shared', () => ({ actionDb: () => mocks.db }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined, set: mocks.set }) }));
vi.mock('next/navigation', () => ({ redirect: (url: string) => { throw new Error(`REDIRECT:${url}`); } }));

import { ensurePendingTotpSecret } from '@/lib/auth/admin-users';
import { MFA_COOKIE_NAME, verifyMfaCookie } from '@/lib/auth/mfa-cookie';
import { totpCodeAt, totpStep } from '@/lib/auth/totp';
import type { DB } from '@/lib/db/index';
import { submitTotpAction } from './actions';

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
