import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MFA_TTL_MS, clearMfaCookie, signMfaCookie, verifyMfaCookie } from './mfa-cookie';

const email = 'ops@example.com';
const sid = '11111111-1111-4111-8111-111111111111';
const enabledAt = new Date('2026-11-01T00:00:00.123Z');
const now = new Date('2026-11-15T09:00:00Z');
beforeEach(() => vi.stubEnv('AUTH_SECRET', 'test-auth-secret'));
afterEach(() => vi.unstubAllEnvs());

describe('2FA cookie', () => {
  const value = () => signMfaCookie({ email, sid, enabledAt, now });

  it('verifies for the same admin, login session and enrollment', () => {
    expect(verifyMfaCookie({ value: value(), email, sid, enabledAt, now })).toBe(true);
    expect(verifyMfaCookie({ value: value(), email: 'OPS@example.com', sid, enabledAt, now })).toBe(true);
    // proxy mode: no enrollment time available
    expect(verifyMfaCookie({ value: value(), email, sid, now })).toBe(true);
  });

  it('rejects another email, another login session or a re-enrollment', () => {
    expect(verifyMfaCookie({ value: value(), email: 'other@example.com', sid, enabledAt, now })).toBe(false);
    expect(verifyMfaCookie({ value: value(), email, sid: '22222222-2222-4222-8222-222222222222', enabledAt, now })).toBe(false);
    expect(verifyMfaCookie({ value: value(), email, sid, enabledAt: new Date(enabledAt.getTime() + 1), now })).toBe(false);
  });

  it('expires after the TTL', () => {
    expect(verifyMfaCookie({ value: value(), email, sid, enabledAt, now: new Date(now.getTime() + MFA_TTL_MS - 1) })).toBe(true);
    expect(verifyMfaCookie({ value: value(), email, sid, enabledAt, now: new Date(now.getTime() + MFA_TTL_MS) })).toBe(false);
  });

  it('rejects tampering, forged expiry and garbage', () => {
    const [s, enabled, exp, mac] = value().split('.');
    const later = String(Number(exp) + MFA_TTL_MS);
    expect(verifyMfaCookie({ value: [s, enabled, later, mac].join('.'), email, sid, enabledAt, now })).toBe(false);
    expect(verifyMfaCookie({ value: [s, enabled, exp, mac.slice(0, -1) + (mac.endsWith('A') ? 'B' : 'A')].join('.'), email, sid, enabledAt, now })).toBe(false);
    for (const bad of [undefined, '', 'x', 'a.b.c.d', `${sid}.1.2`, `${sid}.-1.${exp}.${mac}`]) {
      expect(verifyMfaCookie({ value: bad, email, sid, enabledAt, now })).toBe(false);
    }
    expect(verifyMfaCookie({ value: value(), email, sid: '', now })).toBe(false);
  });

  it('is keyed by AUTH_SECRET', () => {
    const signed = value();
    vi.stubEnv('AUTH_SECRET', 'rotated-secret');
    expect(verifyMfaCookie({ value: signed, email, sid, enabledAt, now })).toBe(false);
  });

  it('clears with the attributes it was set with', () => {
    const set = vi.fn();
    clearMfaCookie({ set });
    expect(set).toHaveBeenCalledWith(expect.stringMatching(/admin-mfa$/), '', expect.objectContaining({ maxAge: 0, path: '/', httpOnly: true }));
  });
});
