import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PASSKEY_CHALLENGE_TTL_MS, signPasskeyToken, verifyPasskeyToken } from '../passkey-token';

const email = 'ops@example.com';
const sid = '11111111-1111-4111-8111-111111111111';
const challenge = 'dGVzdC1jaGFsbGVuZ2UtMDEyMzQ1Njc4OQ';
const enabledAt = new Date('2026-11-01T00:00:00.000Z');
const now = new Date('2026-11-21T09:00:00.000Z');

beforeEach(() => vi.stubEnv('AUTH_SECRET', 'test-auth-secret'));
afterEach(() => vi.unstubAllEnvs());

const issue = (purpose: 'signin' | 'register' = 'signin') => signPasskeyToken({ purpose, email, sid, challenge, enabledAt, now });
const check = (value: unknown, overrides: Partial<Parameters<typeof verifyPasskeyToken>[0]> = {}) =>
  verifyPasskeyToken({ value, purpose: 'signin', email, sid, now, ...overrides });

describe('passkey challenge token', () => {
  it('returns the challenge, enrollment time and issue time it was signed with', () => {
    expect(check(issue())).toEqual({ challenge, enabledAtMs: enabledAt.getTime(), issuedAt: now });
    expect(check(issue(), { email: 'OPS@example.com' })).not.toBeNull();
  });

  it('purpose separation: a sign-in token is not a registration token, and vice versa', () => {
    expect(check(issue('signin'), { purpose: 'register' })).toBeNull();
    expect(check(issue('register'), { purpose: 'signin' })).toBeNull();
    // Relabelling the purpose breaks the MAC.
    expect(check(issue('signin').replace('.signin.', '.register.'), { purpose: 'register' })).toBeNull();
  });

  it('only works for the admin and login session it was issued to', () => {
    expect(check(issue(), { email: 'other@example.com' })).toBeNull();
    expect(check(issue(), { sid: '22222222-2222-4222-8222-222222222222' })).toBeNull();
  });

  it('expires', () => {
    expect(check(issue(), { now: new Date(now.getTime() + PASSKEY_CHALLENGE_TTL_MS - 1) })).not.toBeNull();
    expect(check(issue(), { now: new Date(now.getTime() + PASSKEY_CHALLENGE_TTL_MS) })).toBeNull();
  });

  it('rejects any edited field', () => {
    const parts = issue().split('.');
    const edited = (index: number, value: string) => parts.map((part, i) => (i === index ? value : part)).join('.');
    expect(check(edited(2, 'YW5vdGhlci1jaGFsbGVuZ2UtMDEyMzQ1Njc4OQ'))).toBeNull();
    expect(check(edited(3, String(enabledAt.getTime() + 1)))).toBeNull();
    // A later issue time would both extend the lifetime and defeat the single-use guard.
    expect(check(edited(4, String(now.getTime() + 60_000)))).toBeNull();
    expect(check(edited(5, parts[5].slice(0, -1) + (parts[5].endsWith('A') ? 'B' : 'A')))).toBeNull();
  });

  it('rejects malformed input and a different signing secret', () => {
    for (const value of [undefined, null, 42, '', 'v1.signin', issue().replace('v1.', 'v2.'), 'x'.repeat(600)]) {
      expect(check(value)).toBeNull();
    }
    const token = issue();
    vi.stubEnv('AUTH_SECRET', 'another-secret');
    expect(check(token)).toBeNull();
  });
});
