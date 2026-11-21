import { createHash, createSign, generateKeyPairSync, randomBytes, type KeyObject } from 'node:crypto';
import { isoCBOR } from '@simplewebauthn/server/helpers';

/**
 * Test-only WebAuthn authenticator: an ES256 key pair that returns the same
 * JSON a browser's `credential.toJSON()` produces (attestation "none"). Tests
 * built on it run the real signature, flag, origin and RP ID verification
 * instead of mocking the verifier.
 */
const FLAG = { userPresent: 0x01, userVerified: 0x04, backupEligible: 0x08, backedUp: 0x10, attestedCredential: 0x40 };

type Bytes = Uint8Array<ArrayBuffer>;
const bytes = (value: ArrayLike<number>): Bytes => Uint8Array.from(value);
const b64url = (value: ArrayLike<number>) => Buffer.from(bytes(value)).toString('base64url');
const sha256 = (value: Bytes): Bytes => bytes(createHash('sha256').update(value).digest());

function concat(...parts: Bytes[]): Bytes {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function uint(value: number, size: 2 | 4): Bytes {
  const out = new Uint8Array(size);
  const view = new DataView(out.buffer);
  if (size === 2) view.setUint16(0, value);
  else view.setUint32(0, value);
  return out;
}

export type CeremonyInput = {
  challenge: string;
  origin: string;
  rpID: string;
  /** false = the authenticator skipped fingerprint/PIN (UV flag clear). */
  userVerified?: boolean;
  signCount?: number;
};

export class SoftwareAuthenticator {
  readonly credentialId: string;
  private readonly rawId: Bytes;
  private readonly privateKey: KeyObject;
  private readonly cosePublicKey: Bytes;

  constructor(private readonly traits: { backupEligible?: boolean; backedUp?: boolean } = {}) {
    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const jwk = publicKey.export({ format: 'jwk' });
    this.privateKey = privateKey;
    this.rawId = bytes(randomBytes(32));
    this.credentialId = b64url(this.rawId);
    // COSE_Key: kty=EC2, alg=ES256, crv=P-256, x, y.
    this.cosePublicKey = isoCBOR.encode(new Map<number, number | Bytes>([
      [1, 2], [3, -7], [-1, 1],
      [-2, bytes(Buffer.from(jwk.x!, 'base64url'))],
      [-3, bytes(Buffer.from(jwk.y!, 'base64url'))],
    ]));
  }

  private flags(userVerified: boolean, attested: boolean): number {
    return FLAG.userPresent
      | (userVerified ? FLAG.userVerified : 0)
      | (this.traits.backupEligible ? FLAG.backupEligible : 0)
      | (this.traits.backedUp ? FLAG.backedUp : 0)
      | (attested ? FLAG.attestedCredential : 0);
  }

  private clientData(type: 'webauthn.create' | 'webauthn.get', { challenge, origin }: CeremonyInput): Bytes {
    return bytes(Buffer.from(JSON.stringify({ type, challenge, origin, crossOrigin: false }), 'utf8'));
  }

  private envelope() {
    return { id: this.credentialId, rawId: this.credentialId, type: 'public-key' as const, authenticatorAttachment: 'platform' as const, clientExtensionResults: {} };
  }

  register(input: CeremonyInput) {
    const authData = concat(
      sha256(bytes(Buffer.from(input.rpID, 'utf8'))),
      bytes([this.flags(input.userVerified ?? true, true)]),
      uint(input.signCount ?? 0, 4),
      new Uint8Array(16), // aaguid: all zero, as most platform passkeys report with "none" attestation
      uint(this.rawId.length, 2),
      this.rawId,
      this.cosePublicKey,
    );
    const attestationObject = isoCBOR.encode(new Map<string, string | Bytes | Map<string, string>>([
      ['fmt', 'none'], ['attStmt', new Map<string, string>()], ['authData', authData],
    ]));
    return {
      ...this.envelope(),
      response: {
        clientDataJSON: b64url(this.clientData('webauthn.create', input)),
        attestationObject: b64url(attestationObject),
        transports: ['internal', 'hybrid'],
      },
    };
  }

  authenticate(input: CeremonyInput) {
    const clientData = this.clientData('webauthn.get', input);
    const authData = concat(
      sha256(bytes(Buffer.from(input.rpID, 'utf8'))),
      bytes([this.flags(input.userVerified ?? true, false)]),
      uint(input.signCount ?? 0, 4),
    );
    const signature = createSign('SHA256').update(concat(authData, sha256(clientData))).sign(this.privateKey);
    return {
      ...this.envelope(),
      response: {
        clientDataJSON: b64url(clientData),
        authenticatorData: b64url(authData),
        signature: b64url(signature),
      },
    };
  }
}
