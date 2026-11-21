import type { PGlite } from '@electric-sql/pglite';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TEST_TOTP_KEY, createAdminAuthDb, insertAdmin } from '@/lib/auth/__tests__/admin-auth-db';

vi.stubGlobal('React', React);
const mocks = vi.hoisted(() => ({ auth: vi.fn(), db: undefined as unknown, cookie: undefined as string | undefined }));
vi.mock('@/auth', () => ({ auth: mocks.auth }));
vi.mock('@/lib/server/actions/auth/_shared', () => ({ actionDb: () => mocks.db }));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => (mocks.cookie === undefined ? undefined : { value: mocks.cookie }) }),
  headers: async () => new Headers({ host: 'admin.example.com' }),
}));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => { throw new Error(`REDIRECT:${url}`); },
  useRouter: () => ({ refresh: () => {} }),
  unstable_rethrow: () => {},
}));
vi.mock('./actions', () => ({ submitTotpAction: async () => {}, passkeySignInAction: async () => {} }));
vi.mock('@/app/login/actions', () => ({ logoutAction: async () => {} }));

import { TEST_RP, enrollAdmin } from '@/lib/auth/__tests__/passkey-fixtures';
import { SoftwareAuthenticator } from '@/lib/auth/__tests__/software-authenticator';
import { signMfaCookie } from '@/lib/auth/mfa-cookie';
import type { DB } from '@/lib/db/index';
import TwoFactorPage from './page';

const email = 'ops@example.com';
const sid = '11111111-1111-4111-8111-111111111111';
const enabledAt = new Date('2026-11-01T00:00:00.000Z');
let client: PGlite;

async function render(params: Record<string, string> = {}) {
  return renderToStaticMarkup(await TwoFactorPage({ searchParams: Promise.resolve(params) }));
}

beforeEach(async () => {
  vi.stubEnv('AUTH_SECRET', 'test-auth-secret');
  vi.stubEnv('ADMIN_TOTP_ENCRYPTION_KEY', TEST_TOTP_KEY);
  const created = await createAdminAuthDb();
  client = created.client;
  mocks.db = created.db;
  await insertAdmin(client, email);
  mocks.auth.mockResolvedValue({ user: { email }, sid });
  mocks.cookie = undefined;
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await client.close();
});

describe('/login/2fa', () => {
  it('shows QR enrollment for an admin without 2FA, keeping the destination', async () => {
    const html = await render({ callbackUrl: '/review/a1?from=email' });
    expect(html).toContain('2단계 인증 등록');
    expect(html).toContain('src="data:image/svg+xml;utf8,');
    expect(html).toMatch(/[A-Z2-7]{4} [A-Z2-7]{4}/);
    expect(html).toContain('value="/review/a1?from=email"');
    expect(html).toMatch(/autocomplete="one-time-code"/i);
  });

  it('renders enrollment — not a redirect — when a still-signed cookie survives a 2FA reset', async () => {
    // Cookie the proxy would accept (valid MAC, same sid), but enrollment was reset.
    mocks.cookie = signMfaCookie({ email, sid, enabledAt, now: new Date() });
    const html = await render({ callbackUrl: '/' });
    expect(html).toContain('2단계 인증 등록');
  });

  it('asks only for the code once enrolled, and forwards when 2FA already passed', async () => {
    await client.query('UPDATE admin_users SET totp_enabled_at = $1, totp_secret_enc = $2', [enabledAt, 'v1:a:b:c']);
    const html = await render();
    expect(html).toContain('인증 앱에 표시된 6자리 코드를 입력해 주세요.');
    expect(html).not.toContain('data:image/svg+xml');
    mocks.cookie = signMfaCookie({ email, sid, enabledAt, now: new Date() });
    await expect(render({ callbackUrl: '/review/a1' })).rejects.toThrow('REDIRECT:/review/a1');
    await expect(render({ callbackUrl: 'https://evil.test' })).rejects.toThrow(/^REDIRECT:\/$/);
  });

  it('shows the lock and disables input while locked', async () => {
    await client.query(`INSERT INTO login_attempts (key, count, locked_until) VALUES ('admin-2fa:${email}', 5, now() + interval '10 minutes')`);
    const html = await render({ error: 'LOCKED' });
    expect(html).toContain('잠겼습니다');
    expect(html).toMatch(/<input(?=[^>]*name="code")(?=[^>]*disabled="")[^>]*>/);
  });

  it('requires the first factor', async () => {
    mocks.auth.mockResolvedValue(null);
    await expect(render()).rejects.toThrow('REDIRECT:/login');
  });
});

describe('/login/2fa with passkeys', () => {
  const codeInput = /<input(?=[^>]*name="code")[^>]*>/;
  let adminUserId: string;

  beforeEach(async () => {
    vi.stubEnv('AUTH_URL', TEST_RP.origin);
    ({ rows: [{ id: adminUserId }] } = await client.query<{ id: string }>('SELECT id FROM admin_users'));
  });

  it('offers the passkey first, with the code form still there, to an admin who registered one', async () => {
    await enrollAdmin(mocks.db as DB, { adminUserId, email, sid }, new SoftwareAuthenticator());
    const html = await render({ callbackUrl: '/review/a1' });
    expect(html).toContain('패스키로 인증');
    expect(html).toContain('패스키로 인증하거나 인증 앱의 6자리 코드를 입력해 주세요.');
    expect(html).toMatch(codeInput);
    // Focus goes to the passkey button, not the code field.
    expect(html.match(codeInput)![0]).not.toMatch(/autofocus/i);
    expect(html).not.toContain('‘내 패스키’');
  });

  it('keeps the passkey available while the code path is locked', async () => {
    await enrollAdmin(mocks.db as DB, { adminUserId, email, sid }, new SoftwareAuthenticator());
    await client.query(`INSERT INTO login_attempts (key, count, locked_until) VALUES ('admin-2fa:${email}', 5, now() + interval '10 minutes')`);
    const html = await render();
    expect(html).toContain('잠겼습니다');
    expect(html).toContain('패스키로 인증');
  });

  it('shows only the code form, plus where to register, to an enrolled admin without a passkey', async () => {
    await enrollAdmin(mocks.db as DB, { adminUserId, email, sid });
    const html = await render();
    expect(html).not.toContain('패스키로 인증');
    expect(html).toContain('인증 앱에 표시된 6자리 코드를 입력해 주세요.');
    expect(html).toContain('‘내 패스키’');
    expect(html.match(codeInput)![0]).toMatch(/autofocus/i);
  });

  it('offers no passkey during enrollment, another admin\'s passkey, or where no relying party is configured', async () => {
    // Enrollment (no TOTP yet): QR only.
    expect(await render()).not.toContain('패스키');
    // Someone else's passkey is not this admin's.
    const { rows: [other] } = await client.query<{ id: string }>("INSERT INTO admin_users (email) VALUES ('other@example.com') RETURNING id");
    await enrollAdmin(mocks.db as DB, { adminUserId: other.id, email: 'other@example.com', sid }, new SoftwareAuthenticator());
    await enrollAdmin(mocks.db as DB, { adminUserId, email, sid });
    expect(await render()).not.toContain('패스키로 인증');
    // Own passkey, but no RP ID to use it with.
    await client.query('UPDATE admin_passkeys SET admin_user_id = $1', [adminUserId]);
    expect(await render()).toContain('패스키로 인증');
    vi.stubEnv('AUTH_URL', '');
    vi.stubEnv('NEXTAUTH_URL', '');
    vi.stubEnv('NODE_ENV', 'production');
    const html = await render();
    expect(html).not.toContain('패스키');
    expect(html).toMatch(codeInput);
  });
});
