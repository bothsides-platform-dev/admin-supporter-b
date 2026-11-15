import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/auth', () => ({ auth: (handler: unknown) => handler }));
import proxy from './proxy';
import { MFA_COOKIE_NAME, signMfaCookie } from '@/lib/auth/mfa-cookie';

type Req = { url: string; auth: unknown; cookies: { get: (name: string) => { value: string } | undefined } };
const run = proxy as unknown as (req: Req) => Response | undefined;
const sid = '11111111-1111-4111-8111-111111111111';
const session = { user: { email: 'ops@example.com' }, sid };
const jar = (value?: string) => ({ get: (name: string) => (name === MFA_COOKIE_NAME && value ? { value } : undefined) });
const location = (response: Response | undefined) => new URL(response!.headers.get('location')!);

beforeEach(() => vi.stubEnv('AUTH_SECRET', 'test-auth-secret'));
afterEach(() => vi.unstubAllEnvs());

describe('proxy', () => {
  it.each(['/review/a1?from=email&tab=company', '/admin/review/a1?from=slack'])('preserves %s through login', (path) => {
    const response = run({ url: 'https://admin.test' + path, auth: null, cookies: jar() });
    expect(location(response).pathname).toBe('/login');
    expect(location(response).searchParams.get('callbackUrl')).toBe(path);
  });

  it.each(['/review/a1?from=email&tab=company', '/'])('sends a signed-in admin without 2FA to /login/2fa, preserving %s', (path) => {
    const response = run({ url: 'https://admin.test' + path, auth: session, cookies: jar() });
    expect(location(response).pathname).toBe('/login/2fa');
    expect(location(response).searchParams.get('callbackUrl')).toBe(path);
  });

  it('rejects a forged cookie or one from another Google login', () => {
    const other = signMfaCookie({ email: 'ops@example.com', sid: '22222222-2222-4222-8222-222222222222', enabledAt: new Date(), now: new Date() });
    for (const value of ['forged', other]) {
      expect(location(run({ url: 'https://admin.test/users', auth: session, cookies: jar(value) })).pathname).toBe('/login/2fa');
    }
    // pre-2FA session without sid
    const signed = signMfaCookie({ email: 'ops@example.com', sid, enabledAt: new Date(), now: new Date() });
    expect(location(run({ url: 'https://admin.test/users', auth: { user: { email: 'ops@example.com' } }, cookies: jar(signed) })).pathname).toBe('/login/2fa');
  });

  it('lets through requests holding a valid 2FA cookie for this login', () => {
    const value = signMfaCookie({ email: 'ops@example.com', sid, enabledAt: new Date(), now: new Date() });
    expect(run({ url: 'https://admin.test/review/a1', auth: session, cookies: jar(value) })).toBeUndefined();
  });
});
