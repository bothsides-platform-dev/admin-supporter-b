import { createHmac, hkdfSync, timingSafeEqual } from 'node:crypto';
import { hostPrefix, laxCookieOptions } from './cookie-config';

/**
 * "This browser passed TOTP" marker — a separate signed httpOnly cookie, NOT a
 * claim inside the Auth.js JWT. (A JWT claim would have to be written through
 * the `update` trigger, which the public POST /api/auth/session also reaches
 * with arbitrary client data.)
 *
 * Value: `<sid>.<enabledAtMs>.<expMs>.<mac>`, MAC = HMAC-SHA256 over the admin
 * email, the login session id minted at Google sign-in, the TOTP enrollment
 * time and the expiry. Binding to sid means a fresh Google login always needs
 * TOTP again; binding to enabledAt means a 2FA reset/re-enrollment invalidates
 * every outstanding cookie.
 */
export const MFA_COOKIE_BASE = 'admin-mfa';
export const MFA_COOKIE_NAME = `${hostPrefix}${MFA_COOKIE_BASE}`;
export const MFA_TTL_MS = 12 * 60 * 60 * 1000;

export const mfaCookieOptions = { ...laxCookieOptions, maxAge: MFA_TTL_MS / 1000 } as const;

/**
 * Expire with the same Secure/Path attributes it was set with — a bare
 * `delete()` omits `Secure`, which browsers reject for `__Host-` cookies.
 */
export function clearMfaCookie(jar: { set: (name: string, value: string, options: object) => unknown }): void {
  jar.set(MFA_COOKIE_NAME, '', { ...laxCookieOptions, maxAge: 0 });
}

function macKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error('AUTH_SECRET is not set');
  return new Uint8Array(hkdfSync('sha256', secret, 'admin-supporter-b', 'admin-mfa-cookie v1', 32));
}

function mac(email: string, sid: string, enabledAtMs: number, expMs: number): string {
  return createHmac('sha256', macKey())
    .update(`v1|${email.toLowerCase()}|${sid}|${enabledAtMs}|${expMs}`)
    .digest('base64url');
}

export function signMfaCookie({ email, sid, enabledAt, now }: {
  email: string; sid: string; enabledAt: Date; now: Date;
}): string {
  const enabledAtMs = enabledAt.getTime();
  const expMs = now.getTime() + MFA_TTL_MS;
  return `${sid}.${enabledAtMs}.${expMs}.${mac(email, sid, enabledAtMs, expMs)}`;
}

/**
 * `enabledAt` omitted = signature/expiry/session check only (proxy, which has
 * no DB). The authoritative check (`hasPassedMfa`) always passes it.
 */
export function verifyMfaCookie({ value, email, sid, enabledAt, now }: {
  value: string | undefined; email: string; sid: string; enabledAt?: Date; now: Date;
}): boolean {
  if (!value || !email || !sid) return false;
  const parts = value.split('.');
  if (parts.length !== 4) return false;
  const [cookieSid, enabledRaw, expRaw, cookieMac] = parts;
  if (!/^\d{1,16}$/.test(enabledRaw) || !/^\d{1,16}$/.test(expRaw)) return false;
  const enabledAtMs = Number(enabledRaw);
  const expMs = Number(expRaw);
  if (cookieSid !== sid) return false;
  if (enabledAt && enabledAt.getTime() !== enabledAtMs) return false;
  if (expMs <= now.getTime()) return false;
  const encoder = new TextEncoder();
  const expected = encoder.encode(mac(email, sid, enabledAtMs, expMs));
  const actual = encoder.encode(cookieMac);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
