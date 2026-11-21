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
  unstable_rethrow: () => {},
}));
vi.mock('@/lib/server/actions/admin/passkeys', () => ({
  beginPasskeyRegistrationAction: async () => {},
  finishPasskeyRegistrationAction: async () => {},
  removePasskeyAction: async () => {},
}));

import { TEST_RP, enrollAdmin } from '@/lib/auth/__tests__/passkey-fixtures';
import { SoftwareAuthenticator } from '@/lib/auth/__tests__/software-authenticator';
import { signMfaCookie } from '@/lib/auth/mfa-cookie';
import { MAX_PASSKEYS_PER_ADMIN } from '@/lib/auth/passkey-limits';
import PasskeysPage from './page';

const email = 'ops@example.com';
const sid = '11111111-1111-4111-8111-111111111111';
let client: PGlite;
let admin: Awaited<ReturnType<typeof enrollAdmin>>;

const render = async () => renderToStaticMarkup(await PasskeysPage());
const insertPasskey = (adminUserId: string, credentialId: string, label: string) => client.query(
  `INSERT INTO admin_passkeys (admin_user_id, credential_id, public_key, backup_eligible, backed_up, aaguid, label)
   VALUES ($1, $2, 'pk', true, true, '00000000-0000-0000-0000-000000000000', $3)`,
  [adminUserId, credentialId, label],
);

beforeEach(async () => {
  vi.stubEnv('AUTH_SECRET', 'test-auth-secret');
  vi.stubEnv('ADMIN_TOTP_ENCRYPTION_KEY', TEST_TOTP_KEY);
  vi.stubEnv('AUTH_URL', TEST_RP.origin);
  const created = await createAdminAuthDb();
  client = created.client;
  mocks.db = created.db;
  admin = await enrollAdmin(created.db, { adminUserId: await insertAdmin(client, email), email, sid }, new SoftwareAuthenticator());
  mocks.auth.mockResolvedValue({ user: { email }, sid });
  mocks.cookie = signMfaCookie({ email, sid, enabledAt: admin.totpEnabledAt, now: new Date() });
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await client.close();
});

describe('/passkeys', () => {
  it('lists the admin\'s own passkeys — nobody else\'s — with the registration form', async () => {
    const other = await insertAdmin(client, 'other@example.com');
    await insertPasskey(other, 'cred-other', '남의 기기');
    await insertPasskey(admin.adminUserId, 'cred-synced', '아이폰');
    const html = await render();
    expect(html).toContain('내 패스키');
    expect(html).toContain('회사 맥북');
    expect(html).toContain('이 기기 전용');
    expect(html).toContain('아이폰');
    expect(html).toContain('여러 기기 동기화');
    expect(html).toContain('아직 사용 안 함');
    expect(html).not.toContain('남의 기기');
    expect(html).toMatch(/<input(?=[^>]*name="label")[^>]*>/);
    expect(html).toMatch(/<input(?=[^>]*name="code")(?=[^>]*autoComplete="one-time-code")[^>]*>/i);
  });

  it('shows an empty state and still offers registration', async () => {
    await client.query('DELETE FROM admin_passkeys');
    const html = await render();
    expect(html).toContain('등록된 패스키가 없습니다.');
    expect(html).toContain('패스키 등록');
  });

  it('replaces the form with the reason when the list is full or no relying party is configured', async () => {
    for (let index = 1; index < MAX_PASSKEYS_PER_ADMIN; index++) await insertPasskey(admin.adminUserId, `cred-${index}`, `기기 ${index}`);
    const full = await render();
    expect(full).toContain(`패스키는 ${MAX_PASSKEYS_PER_ADMIN}개까지 등록할 수 있습니다.`);
    expect(full).not.toMatch(/name="code"/);

    vi.stubEnv('AUTH_URL', '');
    vi.stubEnv('NEXTAUTH_URL', '');
    vi.stubEnv('NODE_ENV', 'production');
    const unavailable = await render();
    expect(unavailable).toContain('이 환경에서는 패스키를 사용할 수 없습니다.');
    expect(unavailable).not.toMatch(/name="code"/);
  });

  it('needs both factors', async () => {
    mocks.cookie = undefined;
    await expect(render()).rejects.toThrow('REDIRECT:/login/2fa');
    mocks.auth.mockResolvedValue(null);
    await expect(render()).rejects.toThrow(/^REDIRECT:\/login$/);
  });
});
