import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * TOTP secrets are stored in the DB shared with the main app, so they are
 * encrypted with a key only this admin app holds (ADMIN_TOTP_ENCRYPTION_KEY,
 * base64 of 32 random bytes). The admin row id is bound as AAD, so a
 * ciphertext copied onto another row does not decrypt. Missing/invalid key
 * fails closed.
 *
 * (Plain Uint8Array throughout: this repo's @types/node predates TS 6's typed
 * array generics, so Buffer is not assignable where Uint8Array is expected.)
 */
const VERSION = 'v1';
const TAG_LENGTH = 16;

const utf8 = (value: string) => new TextEncoder().encode(value);
const fromB64 = (value: string, encoding: 'base64' | 'base64url') => Uint8Array.from(Buffer.from(value, encoding));
const toB64url = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64url');

function concat(parts: ArrayLike<number>[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function encryptionKey(): Uint8Array {
  const raw = process.env.ADMIN_TOTP_ENCRYPTION_KEY?.trim();
  if (!raw) throw new Error('ADMIN_TOTP_ENCRYPTION_KEY is not set');
  const key = fromB64(raw, 'base64');
  if (key.length !== 32) throw new Error('ADMIN_TOTP_ENCRYPTION_KEY must be base64 of 32 bytes');
  return key;
}

export function encryptTotpSecret(secret: string, adminUserId: string): string {
  const iv = Uint8Array.from(randomBytes(12));
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv, { authTagLength: TAG_LENGTH });
  cipher.setAAD(utf8(adminUserId));
  const ciphertext = concat([cipher.update(utf8(secret)), cipher.final()]);
  const tag = Uint8Array.from(cipher.getAuthTag());
  return [VERSION, toB64url(iv), toB64url(tag), toB64url(ciphertext)].join(':');
}

export function decryptTotpSecret(stored: string, adminUserId: string): string {
  const [version, iv, tag, ciphertext, ...rest] = stored.split(':');
  if (version !== VERSION || !iv || !tag || !ciphertext || rest.length) throw new Error('INVALID_TOTP_CIPHERTEXT');
  // Pin the tag length so a truncated tag can't weaken authentication.
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), fromB64(iv, 'base64url'), { authTagLength: TAG_LENGTH });
  decipher.setAAD(utf8(adminUserId));
  decipher.setAuthTag(fromB64(tag, 'base64url'));
  const plain = concat([decipher.update(fromB64(ciphertext, 'base64url')), decipher.final()]);
  return new TextDecoder().decode(plain);
}
