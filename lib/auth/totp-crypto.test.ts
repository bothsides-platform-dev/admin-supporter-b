import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { decryptTotpSecret, encryptTotpSecret } from './totp-crypto';

const KEY = Buffer.alloc(32, 7).toString('base64');
const ID = '10000000-0000-4000-8000-000000000001';
beforeEach(() => vi.stubEnv('ADMIN_TOTP_ENCRYPTION_KEY', KEY));
afterEach(() => vi.unstubAllEnvs());

describe('TOTP secret encryption at rest', () => {
  it('round-trips and never stores the plaintext', () => {
    const stored = encryptTotpSecret('JBSWY3DPEHPK3PXP', ID);
    expect(stored).toMatch(/^v1:/);
    expect(stored).not.toContain('JBSWY3DPEHPK3PXP');
    expect(decryptTotpSecret(stored, ID)).toBe('JBSWY3DPEHPK3PXP');
    expect(encryptTotpSecret('JBSWY3DPEHPK3PXP', ID)).not.toBe(stored);
  });

  it('refuses a ciphertext moved to another admin row', () => {
    const stored = encryptTotpSecret('JBSWY3DPEHPK3PXP', ID);
    expect(() => decryptTotpSecret(stored, '10000000-0000-4000-8000-000000000002')).toThrow();
  });

  it('refuses tampered or truncated ciphertexts', () => {
    const [v, iv, tag, ct] = encryptTotpSecret('JBSWY3DPEHPK3PXP', ID).split(':');
    const flipped = Buffer.from(ct, 'base64url');
    flipped[0] ^= 1;
    expect(() => decryptTotpSecret([v, iv, tag, flipped.toString('base64url')].join(':'), ID)).toThrow();
    expect(() => decryptTotpSecret([v, iv, tag.slice(0, 8), ct].join(':'), ID)).toThrow();
    expect(() => decryptTotpSecret(['v2', iv, tag, ct].join(':'), ID)).toThrow('INVALID_TOTP_CIPHERTEXT');
    expect(() => decryptTotpSecret('garbage', ID)).toThrow('INVALID_TOTP_CIPHERTEXT');
  });

  it('fails closed without a valid key, and a different key cannot decrypt', () => {
    const stored = encryptTotpSecret('JBSWY3DPEHPK3PXP', ID);
    vi.stubEnv('ADMIN_TOTP_ENCRYPTION_KEY', Buffer.alloc(32, 8).toString('base64'));
    expect(() => decryptTotpSecret(stored, ID)).toThrow();
    vi.stubEnv('ADMIN_TOTP_ENCRYPTION_KEY', '');
    expect(() => encryptTotpSecret('X', ID)).toThrow('ADMIN_TOTP_ENCRYPTION_KEY is not set');
    vi.stubEnv('ADMIN_TOTP_ENCRYPTION_KEY', Buffer.alloc(16).toString('base64'));
    expect(() => encryptTotpSecret('X', ID)).toThrow('32 bytes');
  });
});
