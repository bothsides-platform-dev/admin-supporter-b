import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * RFC 6238 TOTP (HMAC-SHA1, 30s step, 6 digits) — the profile every common
 * authenticator app (Google Authenticator, 1Password, Authy…) uses by default.
 */
export const TOTP_PERIOD_SECONDS = 30;
export const TOTP_DIGITS = 6;
/** Accept the previous/next step too, to tolerate phone clock drift. */
export const TOTP_WINDOW = 1;
export const TOTP_ISSUER = '서포트비 어드민';

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

/** Lenient on case, spaces and `=` padding (manual entry); throws on any other character. */
export function base32Decode(input: string): Uint8Array {
  const clean = input.replace(/[\s=]/g, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = BASE32.indexOf(ch);
    if (idx < 0) throw new Error('INVALID_BASE32');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Uint8Array.from(out);
}

/** 160-bit secret (RFC 4226 recommends ≥128, SHA1 block-friendly 160). */
export function generateTotpSecret(): string {
  return base32Encode(Uint8Array.from(randomBytes(20)));
}

export function totpStep(now: Date): number {
  return Math.floor(now.getTime() / 1000 / TOTP_PERIOD_SECONDS);
}

export function totpCodeAt(secret: string, step: number, digits = TOTP_DIGITS): string {
  const counter = new Uint8Array(8);
  const view = new DataView(counter.buffer);
  view.setUint32(0, Math.floor(step / 2 ** 32));
  view.setUint32(4, step >>> 0);
  const mac = createHmac('sha1', base32Decode(secret)).update(counter).digest();
  const offset = mac[mac.length - 1] & 0x0f;
  const binary =
    ((mac[offset] & 0x7f) << 24) |
    (mac[offset + 1] << 16) |
    (mac[offset + 2] << 8) |
    mac[offset + 3];
  return String(binary % 10 ** digits).padStart(digits, '0');
}

/** Strip the separators people type ("123 456", "123-456"); anything else stays invalid. */
export function normalizeTotpInput(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const code = raw.replace(/[\s-]/g, '');
  return new RegExp(`^\\d{${TOTP_DIGITS}}$`).test(code) ? code : null;
}

/**
 * Returns the matched time step (so the caller can block its reuse) or null.
 * Every candidate in the window is compared in constant time.
 */
export function verifyTotp(secret: string, input: unknown, now: Date): number | null {
  const code = normalizeTotpInput(input);
  if (!code) return null;
  const current = totpStep(now);
  const encoder = new TextEncoder();
  const actual = encoder.encode(code);
  let matched: number | null = null;
  for (let delta = -TOTP_WINDOW; delta <= TOTP_WINDOW; delta++) {
    const step = current + delta;
    const expected = encoder.encode(totpCodeAt(secret, step));
    if (timingSafeEqual(expected, actual) && matched === null) matched = step;
  }
  return matched;
}

export function otpauthUri(email: string, secret: string): string {
  const label = encodeURIComponent(`${TOTP_ISSUER}:${email}`);
  // Percent-encode (not URLSearchParams' `+` for spaces): some authenticator
  // apps show a literal "+" in the issuer otherwise.
  const query = Object.entries({
    secret,
    issuer: TOTP_ISSUER,
    algorithm: 'SHA1',
    digits: String(TOTP_DIGITS),
    period: String(TOTP_PERIOD_SECONDS),
  }).map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join('&');
  return `otpauth://totp/${label}?${query}`;
}

/** "ABCD EFGH …" for manual entry. */
export function formatSecretForDisplay(secret: string): string {
  return secret.replace(/(.{4})/g, '$1 ').trim();
}
