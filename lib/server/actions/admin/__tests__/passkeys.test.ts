import type { PGlite } from '@electric-sql/pglite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TEST_TOTP_KEY, createAdminAuthDb, insertAdmin } from '@/lib/auth/__tests__/admin-auth-db';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), db: undefined as unknown, cookie: undefined as string | undefined, revalidatePath: vi.fn(),
}));
vi.mock('@/auth', () => ({ auth: mocks.auth }));
vi.mock('@/lib/server/actions/auth/_shared', () => ({ actionDb: () => mocks.db }));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => (mocks.cookie === undefined ? undefined : { value: mocks.cookie }) }),
  headers: async () => new Headers({ host: 'admin.example.com' }),
}));
vi.mock('next/navigation', () => ({ redirect: (url: string) => { throw new Error(`REDIRECT:${url}`); } }));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));

import { TEST_RP, enrollAdmin } from '@/lib/auth/__tests__/passkey-fixtures';
import { SoftwareAuthenticator } from '@/lib/auth/__tests__/software-authenticator';
import { signMfaCookie } from '@/lib/auth/mfa-cookie';
import { totpCodeAt, totpStep } from '@/lib/auth/totp';
import type { DB } from '@/lib/db/index';
import { beginPasskeyRegistrationAction, finishPasskeyRegistrationAction, removePasskeyAction } from '../passkeys';

const email = 'ops@example.com';
const sid = '11111111-1111-4111-8111-111111111111';
let client: PGlite;
let admin: Awaited<ReturnType<typeof enrollAdmin>>;

const currentCode = () => totpCodeAt(admin.secret, totpStep(new Date()));
const answer = (authenticator: SoftwareAuthenticator, challenge: string) =>
  authenticator.register({ challenge, origin: TEST_RP.origin, rpID: TEST_RP.rpID });
const passkeys = async () => (await client.query<{ id: string; admin_user_id: string; label: string }>(
  'SELECT id, admin_user_id, label FROM admin_passkeys ORDER BY created_at',
)).rows;

beforeEach(async () => {
  vi.stubEnv('AUTH_SECRET', 'test-auth-secret');
  vi.stubEnv('ADMIN_TOTP_ENCRYPTION_KEY', TEST_TOTP_KEY);
  vi.stubEnv('AUTH_URL', TEST_RP.origin);
  mocks.revalidatePath.mockReset();
  const created = await createAdminAuthDb();
  client = created.client;
  mocks.db = created.db;
  admin = await enrollAdmin(created.db, { adminUserId: await insertAdmin(client, email), email, sid });
  mocks.auth.mockResolvedValue({ user: { email }, sid });
  mocks.cookie = signMfaCookie({ email, sid, enabledAt: admin.totpEnabledAt, now: new Date() });
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await client.close();
});

describe('passkey management actions', () => {
  it('registers a passkey for the signed-in admin: TOTP code first, then the device', async () => {
    const started = await beginPasskeyRegistrationAction({ code: currentCode(), label: '회사 맥북' });
    if (!started.ok) throw new Error(started.error);
    const authenticator = new SoftwareAuthenticator();
    await expect(finishPasskeyRegistrationAction({
      token: started.token, label: '회사 맥북', response: answer(authenticator, started.options.challenge),
    })).resolves.toEqual({ ok: true });
    expect(await passkeys()).toEqual([{ id: expect.any(String), admin_user_id: admin.adminUserId, label: '회사 맥북' }]);
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/passkeys');
  });

  it('needs both factors: with only the first factor, every action goes to 2FA and changes nothing', async () => {
    const mine = new SoftwareAuthenticator();
    await enrollAdmin(mocks.db as DB, { adminUserId: await insertAdmin(client, 'second@example.com'), email: 'second@example.com', sid }, mine);
    const started = await beginPasskeyRegistrationAction({ code: currentCode(), label: '회사 맥북' });
    if (!started.ok) throw new Error(started.error);
    const [{ id: someonesPasskey }] = await passkeys();

    // No 2FA cookie, then one earned in a different login session.
    for (const cookie of [undefined, signMfaCookie({ email, sid: '22222222-2222-4222-8222-222222222222', enabledAt: admin.totpEnabledAt, now: new Date() })]) {
      mocks.cookie = cookie;
      await expect(beginPasskeyRegistrationAction({ code: currentCode(), label: '공격자 기기' })).rejects.toThrow('REDIRECT:/login/2fa');
      await expect(finishPasskeyRegistrationAction({
        token: started.token, label: '공격자 기기', response: answer(new SoftwareAuthenticator(), started.options.challenge),
      })).rejects.toThrow('REDIRECT:/login/2fa');
      await expect(removePasskeyAction(someonesPasskey)).rejects.toThrow('REDIRECT:/login/2fa');
    }
    mocks.auth.mockResolvedValue(null);
    await expect(beginPasskeyRegistrationAction({ code: currentCode(), label: '공격자 기기' })).rejects.toThrow(/^REDIRECT:\/login$/);
    expect(await passkeys()).toHaveLength(1);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it('step-up: a fully verified session still gets no challenge without the current TOTP code', async () => {
    await expect(beginPasskeyRegistrationAction({ code: '000000', label: '회사 맥북' })).resolves.toEqual({ ok: false, error: 'INVALID_CODE' });
    await expect(beginPasskeyRegistrationAction({ code: currentCode(), label: '' })).resolves.toEqual({ ok: false, error: 'INVALID_LABEL' });
    await expect(beginPasskeyRegistrationAction(undefined as never)).resolves.toEqual({ ok: false, error: 'INVALID_LABEL' });
    await expect(finishPasskeyRegistrationAction(undefined as never)).resolves.toEqual({ ok: false, error: 'INVALID_LABEL' });
    expect(await passkeys()).toEqual([]);
  });

  it('removes only the caller\'s own passkey', async () => {
    const other = { adminUserId: await insertAdmin(client, 'other@example.com'), email: 'other@example.com', sid };
    await enrollAdmin(mocks.db as DB, other, new SoftwareAuthenticator());
    const started = await beginPasskeyRegistrationAction({ code: currentCode(), label: '내 기기' });
    if (!started.ok) throw new Error(started.error);
    await finishPasskeyRegistrationAction({ token: started.token, label: '내 기기', response: answer(new SoftwareAuthenticator(), started.options.challenge) });
    const rows = await passkeys();
    const mine = rows.find((row) => row.admin_user_id === admin.adminUserId)!;
    const theirs = rows.find((row) => row.admin_user_id === other.adminUserId)!;
    mocks.revalidatePath.mockReset();

    await expect(removePasskeyAction(theirs.id)).resolves.toEqual({ ok: false, error: 'NOT_FOUND' });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
    await expect(removePasskeyAction(mine.id)).resolves.toEqual({ ok: true });
    expect(await passkeys()).toEqual([theirs]);
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/passkeys');
  });

  it('is unavailable where no relying party is configured', async () => {
    vi.stubEnv('AUTH_URL', '');
    vi.stubEnv('NEXTAUTH_URL', '');
    vi.stubEnv('NODE_ENV', 'production');
    await expect(beginPasskeyRegistrationAction({ code: currentCode(), label: '회사 맥북' })).resolves.toEqual({ ok: false, error: 'PASSKEY_UNAVAILABLE' });
    await expect(finishPasskeyRegistrationAction({ token: 'x', label: '회사 맥북', response: null })).resolves.toEqual({ ok: false, error: 'PASSKEY_UNAVAILABLE' });
  });
});
