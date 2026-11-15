import type { PGlite } from '@electric-sql/pglite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TEST_TOTP_KEY, createAdminAuthDb, insertAdmin } from './admin-auth-db';

const mocks = vi.hoisted(() => ({ auth: vi.fn(), db: undefined as unknown, cookie: undefined as string | undefined }));
vi.mock('@/auth', () => ({ auth: mocks.auth }));
vi.mock('@/lib/server/actions/auth/_shared', () => ({ actionDb: () => mocks.db }));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => (mocks.cookie === undefined ? undefined : { value: mocks.cookie }) }),
}));
vi.mock('next/navigation', () => ({ redirect: (url: string) => { throw new Error(`REDIRECT:${url}`); } }));

import { requireAdminIdentity, requireAdminPermission, requireAdminSession } from '../admin-session';
import { signMfaCookie } from '../mfa-cookie';

const email = 'ops@example.com';
const sid = '11111111-1111-4111-8111-111111111111';
const enabledAt = new Date('2026-11-01T00:00:00.123Z');
let client: PGlite;
let adminId: string;

beforeEach(async () => {
  vi.stubEnv('AUTH_SECRET', 'test-auth-secret');
  vi.stubEnv('ADMIN_TOTP_ENCRYPTION_KEY', TEST_TOTP_KEY);
  const created = await createAdminAuthDb();
  client = created.client;
  mocks.db = created.db;
  adminId = await insertAdmin(client, email);
  await client.query('UPDATE admin_users SET totp_enabled_at = $1, totp_secret_enc = $2', [enabledAt, 'v1:x:y:z']);
  mocks.auth.mockResolvedValue({ user: { email: 'Ops@Example.com' }, sid });
  mocks.cookie = signMfaCookie({ email, sid, enabledAt, now: new Date() });
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await client.close();
});

describe('requireAdminSession (allowlist + 2FA)', () => {
  it('admits an allowlisted, enrolled admin holding a valid 2FA cookie', async () => {
    await expect(requireAdminSession()).resolves.toEqual({ adminId: email, adminUserId: adminId, role: 'super_admin' });
    await expect(requireAdminPermission('admin.manage')).resolves.toMatchObject({ role: 'super_admin' });
  });

  it('sends unauthenticated users, and pre-2FA sessions without a sid, to /login', async () => {
    mocks.auth.mockResolvedValue(null);
    await expect(requireAdminSession()).rejects.toThrow('REDIRECT:/login');
    mocks.auth.mockResolvedValue({ user: { email } });
    await expect(requireAdminSession()).rejects.toThrow(/^REDIRECT:\/login$/);
  });

  it('denies emails that are not in admin_users, including removed admins', async () => {
    mocks.auth.mockResolvedValue({ user: { email: 'stranger@example.com' }, sid });
    await expect(requireAdminSession()).rejects.toThrow('REDIRECT:/login?error=AccessDenied');
    mocks.auth.mockResolvedValue({ user: { email }, sid });
    await client.query('DELETE FROM admin_users');
    await expect(requireAdminSession()).rejects.toThrow('REDIRECT:/login?error=AccessDenied');
    await expect(requireAdminIdentity()).rejects.toThrow('REDIRECT:/login?error=AccessDenied');
  });

  it('sends admins without a passing 2FA cookie to /login/2fa', async () => {
    mocks.cookie = undefined;
    await expect(requireAdminSession()).rejects.toThrow('REDIRECT:/login/2fa');
    mocks.cookie = 'forged';
    await expect(requireAdminSession()).rejects.toThrow('REDIRECT:/login/2fa');
    // cookie from another Google login (different sid)
    mocks.cookie = signMfaCookie({ email, sid: '22222222-2222-4222-8222-222222222222', enabledAt, now: new Date() });
    await expect(requireAdminSession()).rejects.toThrow('REDIRECT:/login/2fa');
  });

  it('invalidates outstanding 2FA cookies when 2FA is reset or re-enrolled', async () => {
    await client.query('UPDATE admin_users SET totp_enabled_at = NULL, totp_secret_enc = NULL');
    await expect(requireAdminSession()).rejects.toThrow('REDIRECT:/login/2fa');
    await client.query('UPDATE admin_users SET totp_enabled_at = $1', [new Date(enabledAt.getTime() + 60_000)]);
    await expect(requireAdminSession()).rejects.toThrow('REDIRECT:/login/2fa');
  });

  it('requireAdminIdentity only needs the first factor (for the 2FA page)', async () => {
    mocks.cookie = undefined;
    await expect(requireAdminIdentity()).resolves.toEqual({ adminUserId: adminId, email, sid, totpEnabledAt: enabledAt });
  });
});
