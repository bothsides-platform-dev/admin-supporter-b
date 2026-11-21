import { createHmac, hkdfSync, timingSafeEqual } from 'node:crypto';

/**
 * Signed envelope for a WebAuthn challenge. This app has no server-side session
 * store, so the challenge travels through the client (page props / action
 * results) and comes back with the authenticator's response. It is not a
 * secret — the browser has to see the challenge anyway. The MAC is what stops
 * a client from choosing its own challenge or carrying one somewhere else.
 *
 * Value: `v1.<purpose>.<challenge>.<enabledAtMs>.<issuedAtMs>.<mac>`, MAC =
 * HMAC-SHA256 over the purpose, admin email, login session id, challenge, TOTP
 * enrollment time and issue time.
 * - purpose: a sign-in challenge is handed to anyone who passed only the first
 *   factor; a registration challenge only after a fresh TOTP check. The two
 *   must never be interchangeable.
 * - email + sid: it only works in the login session it was issued to.
 * - enabledAt: a 2FA reset invalidates every outstanding challenge.
 * - issuedAt: expiry is checked here. Single use is NOT — that is the DB write
 *   that consumes the response (lib/auth/passkeys.ts), which only accepts a
 *   challenge issued after the credential's last use / the last registration.
 */
export const PASSKEY_CHALLENGE_TTL_MS = 5 * 60 * 1000;

export type PasskeyPurpose = 'signin' | 'register';
export type PasskeyChallenge = { challenge: string; enabledAtMs: number; issuedAt: Date };

function macKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error('AUTH_SECRET is not set');
  return new Uint8Array(hkdfSync('sha256', secret, 'admin-supporter-b', 'admin-passkey-challenge v1', 32));
}

function mac(purpose: PasskeyPurpose, email: string, sid: string, challenge: string, enabledAtMs: number, issuedAtMs: number): string {
  return createHmac('sha256', macKey())
    .update(`v1|${purpose}|${email.toLowerCase()}|${sid}|${challenge}|${enabledAtMs}|${issuedAtMs}`)
    .digest('base64url');
}

export function signPasskeyToken({ purpose, email, sid, challenge, enabledAt, now }: {
  purpose: PasskeyPurpose; email: string; sid: string; challenge: string; enabledAt: Date; now: Date;
}): string {
  const enabledAtMs = enabledAt.getTime();
  const issuedAtMs = now.getTime();
  return `v1.${purpose}.${challenge}.${enabledAtMs}.${issuedAtMs}.${mac(purpose, email, sid, challenge, enabledAtMs, issuedAtMs)}`;
}

/** Returns the challenge only when the token was issued for this purpose and login session and has not expired. */
export function verifyPasskeyToken({ value, purpose, email, sid, now }: {
  value: unknown; purpose: PasskeyPurpose; email: string; sid: string; now: Date;
}): PasskeyChallenge | null {
  if (typeof value !== 'string' || value.length > 512 || !email || !sid) return null;
  const parts = value.split('.');
  if (parts.length !== 6) return null;
  const [version, tokenPurpose, challenge, enabledRaw, issuedRaw, tokenMac] = parts;
  if (version !== 'v1' || tokenPurpose !== purpose) return null;
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(challenge)) return null;
  if (!/^\d{1,16}$/.test(enabledRaw) || !/^\d{1,16}$/.test(issuedRaw)) return null;
  const enabledAtMs = Number(enabledRaw);
  const issuedAtMs = Number(issuedRaw);
  if (issuedAtMs + PASSKEY_CHALLENGE_TTL_MS <= now.getTime()) return null;
  const encoder = new TextEncoder();
  const expected = encoder.encode(mac(purpose, email, sid, challenge, enabledAtMs, issuedAtMs));
  const actual = encoder.encode(tokenMac);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  return { challenge, enabledAtMs, issuedAt: new Date(issuedAtMs) };
}
