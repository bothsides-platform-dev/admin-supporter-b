import { isIP } from 'node:net';
import { and, asc, eq, isNull, lt, or } from 'drizzle-orm';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/server';
import { COSEALG } from '@simplewebauthn/server/helpers';
import { z } from 'zod';
import { adminAuditLogs, adminPasskeys, adminUsers } from '@/lib/db/schema';
import type { DB } from '@/lib/db/index';
import { attemptTotp } from './admin-users';
import { MAX_PASSKEYS_PER_ADMIN, PASSKEY_LABEL_MAX } from './passkey-limits';
import { PASSKEY_CHALLENGE_TTL_MS, signPasskeyToken, verifyPasskeyToken } from './passkey-token';
import { TOTP_ISSUER } from './totp';

/**
 * Passkeys (WebAuthn) as an ADDITIONAL second factor. TOTP stays the base
 * enrollment: a passkey can only be added by an admin who is enrolled in TOTP,
 * and a successful passkey check mints the very same `admin-mfa` cookie, bound
 * to the same `totpEnabledAt`. So a 2FA reset (which also deletes the rows
 * here) invalidates passkey-minted cookies exactly like TOTP-minted ones.
 *
 * Invariants:
 * - Registration needs a fresh TOTP code on top of an already-verified
 *   session. Otherwise a stolen session could plant its own passkey and stay
 *   past the 12h re-verification limit.
 * - A credential is always looked up by (credential id, signed-in admin).
 * - A response is consumed by one conditional DB write, so the same response
 *   cannot be replayed (also not across concurrent requests).
 * - Passkey checks neither count against nor clear the TOTP attempt lock: a
 *   signature cannot be guessed, and a passkey sign-in must keep working while
 *   someone holding only the first factor keeps the code path locked.
 */
export type PasskeyRow = typeof adminPasskeys.$inferSelect;
type Tx = Parameters<Parameters<DB['transaction']>[0]>[0];
type Queryable = DB | Tx;

/** Classic algorithms every current authenticator offers; pinned so option generation and verification can never disagree. */
const SUPPORTED_ALGORITHMS = [COSEALG.EdDSA, COSEALG.ES256, COSEALG.RS256];
const KNOWN_TRANSPORTS = new Set(['ble', 'cable', 'hybrid', 'internal', 'nfc', 'smart-card', 'usb']);

// ── Relying party ─────────────────────────────────────────────────────────

export type RelyingParty = { rpID: string; origin: string };

/**
 * RP ID and expected origin come from AUTH_URL, never from the request host in
 * production (`trustHost: true` would let a spoofed Host choose them). The RP
 * ID is this app's exact host — not the parent domain it shares with the main
 * app — so a passkey made here cannot be requested by, or used on, the main
 * site. Local dev has no AUTH_URL, so only outside production a `localhost`
 * request host is accepted. An IP host has no valid RP ID: no passkeys there.
 */
export function relyingParty(requestHost?: string | null): RelyingParty | null {
  const configured = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL;
  try {
    if (configured) {
      const url = new URL(configured);
      return isIP(url.hostname) ? null : { rpID: url.hostname, origin: url.origin };
    }
    if (process.env.NODE_ENV === 'production' || !requestHost) return null;
    const url = new URL(`http://${requestHost}`);
    return url.hostname === 'localhost' ? { rpID: 'localhost', origin: url.origin } : null;
  } catch {
    return null;
  }
}

/** WebAuthn user handle (base64url): opaque and free of personal data. The admin row id is stable and is not the email. */
export function passkeyUserId(adminUserId: string): string {
  return Buffer.from(adminUserId, 'utf8').toString('base64url');
}

// ── Listing ───────────────────────────────────────────────────────────────

export type PasskeyListRow = Pick<PasskeyRow, 'id' | 'credentialId' | 'label' | 'backupEligible' | 'createdAt' | 'lastUsedAt'>;

export async function listPasskeys(db: Queryable, adminUserId: string): Promise<PasskeyListRow[]> {
  return db
    .select({
      id: adminPasskeys.id,
      credentialId: adminPasskeys.credentialId,
      label: adminPasskeys.label,
      backupEligible: adminPasskeys.backupEligible,
      createdAt: adminPasskeys.createdAt,
      lastUsedAt: adminPasskeys.lastUsedAt,
    })
    .from(adminPasskeys)
    .where(eq(adminPasskeys.adminUserId, adminUserId))
    .orderBy(asc(adminPasskeys.createdAt), asc(adminPasskeys.id));
}

function credentialDescriptors(db: Queryable, adminUserId: string) {
  return db
    .select({ id: adminPasskeys.credentialId, transports: adminPasskeys.transports })
    .from(adminPasskeys)
    .where(eq(adminPasskeys.adminUserId, adminUserId))
    .orderBy(asc(adminPasskeys.createdAt), asc(adminPasskeys.id));
}

// ── Untrusted browser input ───────────────────────────────────────────────

// Only the fields verification needs. Everything else a browser (or the JSON
// polyfill on older ones) adds — authenticatorAttachment, an empty userHandle,
// extension results — is dropped rather than validated, so a harmless
// difference in shape cannot lock a browser out.
const base64url = (max: number) => z.string().min(1).max(max).regex(/^[A-Za-z0-9_-]+$/);
const credentialEnvelope = {
  id: base64url(1400),
  rawId: base64url(1400),
  type: z.literal('public-key'),
};
const registrationResponseSchema = z.object({
  ...credentialEnvelope,
  response: z.object({
    clientDataJSON: base64url(8192),
    attestationObject: base64url(65536),
    transports: z.array(z.string().max(32)).max(16).nullish(),
  }),
});
const authenticationResponseSchema = z.object({
  ...credentialEnvelope,
  response: z.object({
    clientDataJSON: base64url(8192),
    authenticatorData: base64url(8192),
    signature: base64url(8192),
  }),
});

function normalizeLabel(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const label = raw.trim().replace(/\s+/g, ' ');
  return label.length >= 1 && label.length <= PASSKEY_LABEL_MAX ? label : null;
}

const toBytes = (value: string) => Uint8Array.from(Buffer.from(value, 'base64url'));
const toBase64url = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64url');

/**
 * The admin only sees "rejected". The reason goes to the server log, where it
 * tells an operator about a misconfiguration (e.g. AUTH_URL with the wrong
 * scheme → every response has an "unexpected origin") without telling whoever
 * sent the request anything.
 */
function logRejection(ceremony: 'sign-in' | 'registration', error: unknown): void {
  console.warn(`passkey ${ceremony} rejected:`, error instanceof Error ? error.message : error);
}

// ── Sign-in (second factor) ───────────────────────────────────────────────

export type PasskeyIdentity = { adminUserId: string; email: string; sid: string; totpEnabledAt: Date | null };
export type PasskeySignInChallenge = { options: PublicKeyCredentialRequestOptionsJSON; token: string; expiresAt: number };

/**
 * Sign-in options for an admin who has at least one passkey, else null (the
 * page then shows TOTP only). `allowCredentials` is limited to this admin's
 * own credentials, so the browser cannot offer another account's passkey.
 */
export async function preparePasskeySignIn(
  db: Queryable,
  identity: PasskeyIdentity,
  rp: RelyingParty,
  now: Date,
): Promise<PasskeySignInChallenge | null> {
  if (!identity.totpEnabledAt) return null;
  const credentials = await credentialDescriptors(db, identity.adminUserId);
  if (credentials.length === 0) return null;
  const options = await generateAuthenticationOptions({
    rpID: rp.rpID,
    allowCredentials: credentials.map(({ id, transports }) => ({ id, transports: transports ?? undefined })),
    userVerification: 'required',
  });
  const token = signPasskeyToken({
    purpose: 'signin', email: identity.email, sid: identity.sid,
    challenge: options.challenge, enabledAt: identity.totpEnabledAt, now,
  });
  return { options, token, expiresAt: now.getTime() + PASSKEY_CHALLENGE_TTL_MS };
}

export type PasskeySignInError = 'CHALLENGE_EXPIRED' | 'UNKNOWN_CREDENTIAL' | 'PASSKEY_REJECTED' | 'NOT_READY';
export type PasskeySignInResult = { ok: true; enabledAt: Date } | { ok: false; error: PasskeySignInError };

/**
 * Verifies an assertion for the signed-in admin and consumes it. `enabledAt`
 * in the result is read under the same row lock as the consuming write — it is
 * what the caller binds the 2FA cookie to.
 */
export async function completePasskeySignIn(
  db: DB,
  input: { adminUserId: string; email: string; sid: string; token: unknown; response: unknown; rp: RelyingParty; now: Date },
): Promise<PasskeySignInResult> {
  const { adminUserId, rp, now } = input;
  const challenge = verifyPasskeyToken({ value: input.token, purpose: 'signin', email: input.email, sid: input.sid, now });
  if (!challenge) return { ok: false, error: 'CHALLENGE_EXPIRED' };
  const parsed = authenticationResponseSchema.safeParse(input.response);
  if (!parsed.success) return { ok: false, error: 'PASSKEY_REJECTED' };
  const { id, rawId, response } = parsed.data;

  const [passkey] = await db
    .select()
    .from(adminPasskeys)
    .where(and(eq(adminPasskeys.credentialId, id), eq(adminPasskeys.adminUserId, adminUserId)))
    .limit(1);
  if (!passkey) return { ok: false, error: 'UNKNOWN_CREDENTIAL' };

  let verification: Awaited<ReturnType<typeof verifyAuthenticationResponse>>;
  try {
    verification = await verifyAuthenticationResponse({
      response: {
        id, rawId, type: 'public-key', clientExtensionResults: {},
        response: {
          clientDataJSON: response.clientDataJSON,
          authenticatorData: response.authenticatorData,
          signature: response.signature,
        },
      },
      expectedChallenge: challenge.challenge,
      expectedOrigin: rp.origin,
      expectedRPID: rp.rpID,
      credential: {
        id: passkey.credentialId,
        publicKey: toBytes(passkey.publicKey),
        counter: passkey.signCount,
        transports: passkey.transports ?? undefined,
      },
      requireUserVerification: true,
    });
  } catch (error) {
    // Wrong challenge/origin/RP ID, missing user verification, counter rollback, malformed data…
    logRejection('sign-in', error);
    return { ok: false, error: 'PASSKEY_REJECTED' };
  }
  if (!verification.verified) return { ok: false, error: 'PASSKEY_REJECTED' };
  const { newCounter, credentialBackedUp } = verification.authenticationInfo;

  return db.transaction(async (tx): Promise<PasskeySignInResult> => {
    const [admin] = await tx
      .select({ enabledAt: adminUsers.totpEnabledAt })
      .from(adminUsers)
      .where(eq(adminUsers.id, adminUserId))
      .for('update');
    if (!admin?.enabledAt || admin.enabledAt.getTime() !== challenge.enabledAtMs) return { ok: false, error: 'NOT_READY' };
    // Single use: only a challenge issued after this credential's last use is accepted.
    // A miss is a replay — or simply a page that was rendered before the same
    // (synced) passkey signed in elsewhere. Either way the challenge is spent:
    // the caller is told so and fetches a new one.
    const [used] = await tx
      .update(adminPasskeys)
      .set({ signCount: newCounter, backedUp: credentialBackedUp, lastUsedAt: now })
      .where(and(
        eq(adminPasskeys.id, passkey.id),
        eq(adminPasskeys.adminUserId, adminUserId),
        or(isNull(adminPasskeys.lastUsedAt), lt(adminPasskeys.lastUsedAt, challenge.issuedAt)),
      ))
      .returning({ id: adminPasskeys.id });
    return used ? { ok: true, enabledAt: admin.enabledAt } : { ok: false, error: 'CHALLENGE_EXPIRED' };
  });
}

// ── Registration ──────────────────────────────────────────────────────────

export type PasskeyRegistrationChallenge = { options: PublicKeyCredentialCreationOptionsJSON; token: string };
export type PasskeyRegistrationStartError = 'INVALID_LABEL' | 'PASSKEY_LIMIT' | 'INVALID_CODE' | 'LOCKED' | 'NOT_READY';

/**
 * Step-up + challenge. The caller has already required a fully verified
 * session; on top of that the admin proves the TOTP factor right now. Only
 * then is a registration challenge issued (bound to that TOTP enrollment).
 */
export async function beginPasskeyRegistration(
  db: DB,
  input: { adminUserId: string; email: string; sid: string; code: unknown; label: unknown; rp: RelyingParty; now: Date },
): Promise<({ ok: true } & PasskeyRegistrationChallenge) | { ok: false; error: PasskeyRegistrationStartError }> {
  const { adminUserId, email, rp, now } = input;
  // Checked before the code so a doomed attempt does not burn a TOTP step.
  if (!normalizeLabel(input.label)) return { ok: false, error: 'INVALID_LABEL' };
  const existing = await credentialDescriptors(db, adminUserId);
  if (existing.length >= MAX_PASSKEYS_PER_ADMIN) return { ok: false, error: 'PASSKEY_LIMIT' };

  const totp = await attemptTotp(db, email, input.code, now);
  if (!totp.ok) return { ok: false, error: totp.error };
  // The code enrolled TOTP just now (a reset raced us): this session's 2FA cookie no longer matches.
  if (totp.enrolled) return { ok: false, error: 'NOT_READY' };

  const options = await generateRegistrationOptions({
    rpName: TOTP_ISSUER,
    rpID: rp.rpID,
    userName: email,
    userDisplayName: email,
    userID: Uint8Array.from(Buffer.from(adminUserId, 'utf8')),
    attestationType: 'none',
    excludeCredentials: existing.map(({ id, transports }) => ({ id, transports: transports ?? undefined })),
    // Sign-in always names the admin's credentials (allowCredentials), so a
    // discoverable credential is not required; user verification is.
    authenticatorSelection: { residentKey: 'preferred', userVerification: 'required' },
    supportedAlgorithmIDs: SUPPORTED_ALGORITHMS,
  });
  const token = signPasskeyToken({
    purpose: 'register', email, sid: input.sid, challenge: options.challenge, enabledAt: totp.enabledAt, now,
  });
  return { ok: true, options, token };
}

export type PasskeyRegistrationError =
  | 'INVALID_LABEL' | 'CHALLENGE_EXPIRED' | 'PASSKEY_REJECTED' | 'PASSKEY_ALREADY_REGISTERED' | 'PASSKEY_LIMIT' | 'NOT_READY';

export async function completePasskeyRegistration(
  db: DB,
  input: { adminUserId: string; email: string; sid: string; token: unknown; response: unknown; label: unknown; rp: RelyingParty; now: Date },
): Promise<{ ok: true; passkeyId: string } | { ok: false; error: PasskeyRegistrationError }> {
  const { adminUserId, email, rp, now } = input;
  const label = normalizeLabel(input.label);
  if (!label) return { ok: false, error: 'INVALID_LABEL' };
  // Purpose-checked: a sign-in challenge (obtainable with the first factor alone) is not accepted here.
  const challenge = verifyPasskeyToken({ value: input.token, purpose: 'register', email, sid: input.sid, now });
  if (!challenge) return { ok: false, error: 'CHALLENGE_EXPIRED' };
  const parsed = registrationResponseSchema.safeParse(input.response);
  if (!parsed.success) return { ok: false, error: 'PASSKEY_REJECTED' };
  const { id, rawId, response } = parsed.data;
  const transports = [...new Set(response.transports ?? [])].filter((transport) => KNOWN_TRANSPORTS.has(transport));

  let verification: Awaited<ReturnType<typeof verifyRegistrationResponse>>;
  try {
    verification = await verifyRegistrationResponse({
      response: {
        id, rawId, type: 'public-key', clientExtensionResults: {},
        response: { clientDataJSON: response.clientDataJSON, attestationObject: response.attestationObject, transports },
      },
      expectedChallenge: challenge.challenge,
      expectedOrigin: rp.origin,
      expectedRPID: rp.rpID,
      requireUserVerification: true,
      supportedAlgorithmIDs: SUPPORTED_ALGORITHMS,
    });
  } catch (error) {
    logRejection('registration', error);
    return { ok: false, error: 'PASSKEY_REJECTED' };
  }
  if (!verification.verified) return { ok: false, error: 'PASSKEY_REJECTED' };
  const { credential, credentialDeviceType, credentialBackedUp, aaguid } = verification.registrationInfo;

  return db.transaction(async (tx): Promise<{ ok: true; passkeyId: string } | { ok: false; error: PasskeyRegistrationError }> => {
    // Serialises with a 2FA reset (which locks the same row) and with a second registration.
    const [admin] = await tx
      .select({ enabledAt: adminUsers.totpEnabledAt })
      .from(adminUsers)
      .where(eq(adminUsers.id, adminUserId))
      .for('update');
    if (!admin?.enabledAt || admin.enabledAt.getTime() !== challenge.enabledAtMs) return { ok: false, error: 'NOT_READY' };

    const existing = await tx
      .select({ createdAt: adminPasskeys.createdAt })
      .from(adminPasskeys)
      .where(eq(adminPasskeys.adminUserId, adminUserId));
    if (existing.length >= MAX_PASSKEYS_PER_ADMIN) return { ok: false, error: 'PASSKEY_LIMIT' };
    // Single use: one registration challenge registers one passkey.
    if (existing.some((row) => row.createdAt.getTime() >= challenge.issuedAt.getTime())) return { ok: false, error: 'CHALLENGE_EXPIRED' };
    const [taken] = await tx
      .select({ id: adminPasskeys.id })
      .from(adminPasskeys)
      .where(eq(adminPasskeys.credentialId, credential.id))
      .limit(1);
    if (taken) return { ok: false, error: 'PASSKEY_ALREADY_REGISTERED' };

    const backupEligible = credentialDeviceType === 'multiDevice';
    const [row] = await tx
      .insert(adminPasskeys)
      .values({
        adminUserId,
        credentialId: credential.id,
        publicKey: toBase64url(credential.publicKey),
        signCount: credential.counter,
        transports: transports.length > 0 ? transports : null,
        backupEligible,
        backedUp: credentialBackedUp,
        aaguid,
        label,
        createdAt: now,
      })
      .returning({ id: adminPasskeys.id });
    await tx.insert(adminAuditLogs).values({
      actor: email,
      action: 'admin_user.passkey_register',
      entityType: 'admin_user',
      entityId: adminUserId,
      payloadJson: { after: { passkeyId: row.id, label, backupEligible } },
    });
    return { ok: true, passkeyId: row.id };
  });
}

// ── Removal ───────────────────────────────────────────────────────────────

/** An admin removes one of their OWN passkeys. Other admins' passkeys only go away through a 2FA reset. */
export async function removePasskey(
  db: DB,
  input: { adminUserId: string; email: string; passkeyId: unknown },
): Promise<{ ok: true } | { ok: false; error: 'NOT_FOUND' }> {
  const passkeyId = z.uuid().safeParse(input.passkeyId);
  if (!passkeyId.success) return { ok: false, error: 'NOT_FOUND' };
  return db.transaction(async (tx): Promise<{ ok: true } | { ok: false; error: 'NOT_FOUND' }> => {
    const [removed] = await tx
      .delete(adminPasskeys)
      .where(and(eq(adminPasskeys.id, passkeyId.data), eq(adminPasskeys.adminUserId, input.adminUserId)))
      .returning({ id: adminPasskeys.id, label: adminPasskeys.label });
    if (!removed) return { ok: false, error: 'NOT_FOUND' };
    await tx.insert(adminAuditLogs).values({
      actor: input.email,
      action: 'admin_user.passkey_remove',
      entityType: 'admin_user',
      entityId: input.adminUserId,
      payloadJson: { before: { passkeyId: removed.id, label: removed.label } },
    });
    return { ok: true };
  });
}
