import { describe, expect, it } from 'vitest';
import {
  base32Decode, base32Encode, formatSecretForDisplay, generateTotpSecret, normalizeTotpInput,
  otpauthUri, totpCodeAt, totpStep, verifyTotp,
} from './totp';

// RFC 6238 Appendix B, SHA1 seed "12345678901234567890" (6-digit = last 6 of the 8-digit vectors).
const RFC_SECRET = base32Encode(new TextEncoder().encode('12345678901234567890'));
const at = (seconds: number) => new Date(seconds * 1000);

describe('TOTP (RFC 6238)', () => {
  it.each([
    [59, '287082'],
    [1111111109, '081804'],
    [1111111111, '050471'],
    [1234567890, '005924'],
    [2000000000, '279037'],
    [20000000000, '353130'],
  ])('T=%i → %s', (seconds, code) => {
    expect(totpCodeAt(RFC_SECRET, totpStep(at(seconds)))).toBe(code);
    expect(verifyTotp(RFC_SECRET, code, at(seconds))).toBe(totpStep(at(seconds)));
  });

  it('accepts exactly one step of clock drift either way', () => {
    const now = at(1234567890);
    const step = totpStep(now);
    expect(verifyTotp(RFC_SECRET, totpCodeAt(RFC_SECRET, step - 1), now)).toBe(step - 1);
    expect(verifyTotp(RFC_SECRET, totpCodeAt(RFC_SECRET, step + 1), now)).toBe(step + 1);
    expect(verifyTotp(RFC_SECRET, totpCodeAt(RFC_SECRET, step - 2), now)).toBeNull();
    expect(verifyTotp(RFC_SECRET, totpCodeAt(RFC_SECRET, step + 2), now)).toBeNull();
  });

  it('rejects malformed input and tolerates typed separators', () => {
    const now = at(59);
    for (const bad of [undefined, null, 287082, '', '28708', '2870822', '28708a', '２８７０８２']) {
      expect(verifyTotp(RFC_SECRET, bad, now)).toBeNull();
    }
    expect(verifyTotp(RFC_SECRET, '287 082', now)).not.toBeNull();
    expect(verifyTotp(RFC_SECRET, '287-082', now)).not.toBeNull();
    expect(normalizeTotpInput(' 287082 ')).toBe('287082');
  });

  it('round-trips base32 and generates 160-bit secrets', () => {
    const bytes = Uint8Array.from([0, 1, 2, 250, 251, 252, 253, 254, 255, 7]);
    expect(Array.from(base32Decode(base32Encode(bytes)))).toEqual(Array.from(bytes));
    expect(Array.from(base32Decode('gezd gnbv\n'))).toEqual(Array.from(base32Decode('GEZDGNBV')));
    expect(() => base32Decode('GEZ1')).toThrow('INVALID_BASE32');
    const secret = generateTotpSecret();
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(generateTotpSecret()).not.toBe(secret);
    expect(formatSecretForDisplay('ABCDEFGHIJ')).toBe('ABCD EFGH IJ');
  });

  it('builds an otpauth URI authenticator apps understand', () => {
    const uri = new URL(otpauthUri('ops@example.com', 'JBSWY3DPEHPK3PXP'));
    expect(uri.protocol).toBe('otpauth:');
    expect(uri.host).toBe('totp');
    expect(decodeURIComponent(uri.pathname)).toBe('/서포트비 어드민:ops@example.com');
    expect(uri.search).not.toContain('+');
    expect(Object.fromEntries(uri.searchParams)).toEqual({
      secret: 'JBSWY3DPEHPK3PXP', issuer: '서포트비 어드민', algorithm: 'SHA1', digits: '6', period: '30',
    });
  });
});
