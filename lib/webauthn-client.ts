/**
 * Browser-side WebAuthn helpers — import from client components only.
 *
 * The native API is called directly. `webauthn-polyfills` only supplies the
 * newer JSON (`parse…FromJSON`, `toJSON`) and capability helpers on browsers
 * that have WebAuthn but not those yet (Safari < 18.4, Chrome < 129).
 */
import type {
  PublicKeyCredentialCreationOptionsJSON as ServerCreationOptions,
  PublicKeyCredentialRequestOptionsJSON as ServerRequestOptions,
} from '@simplewebauthn/server';

let polyfills: Promise<unknown> | null = null;

/*
 * The server library and lib.dom describe the same JSON. They only disagree on
 * the static type of `extensions`: the library's allows binary inputs, which it
 * never emits in the JSON it generates here. Hence one cast in each parser.
 */

/** Synchronous — safe to call inside a click handler right before `navigator.credentials.get()`. */
export function requestOptionsFromJSON(options: ServerRequestOptions): PublicKeyCredentialRequestOptions {
  return PublicKeyCredential.parseRequestOptionsFromJSON(options as PublicKeyCredentialRequestOptionsJSON);
}

/** Synchronous — safe to call inside a click handler right before `navigator.credentials.create()`. */
export function creationOptionsFromJSON(options: ServerCreationOptions): PublicKeyCredentialCreationOptions {
  return PublicKeyCredential.parseCreationOptionsFromJSON(options as PublicKeyCredentialCreationOptionsJSON);
}

/**
 * Resolves true once this browser can run a passkey ceremony from JSON
 * options. Call it from an effect, well before any click: the ceremony itself
 * must start synchronously inside the click handler.
 */
export async function prepareWebAuthn(): Promise<boolean> {
  if (typeof window === 'undefined' || typeof window.PublicKeyCredential === 'undefined') return false;
  polyfills ??= import('webauthn-polyfills').catch(() => undefined);
  await polyfills;
  return (
    typeof PublicKeyCredential.parseRequestOptionsFromJSON === 'function' &&
    typeof PublicKeyCredential.parseCreationOptionsFromJSON === 'function'
  );
}

/** Whether a passkey can be created here: a platform authenticator on this device, or a phone over hybrid transport. */
export async function canCreatePasskey(): Promise<boolean> {
  if (!(await prepareWebAuthn()) || typeof PublicKeyCredential.getClientCapabilities !== 'function') return false;
  try {
    const capabilities = await PublicKeyCredential.getClientCapabilities();
    return Boolean(capabilities.passkeyPlatformAuthenticator);
  } catch {
    return false;
  }
}

export type CeremonyFailure = 'CANCELLED' | 'ALREADY_REGISTERED' | 'NOT_ALLOWED_HERE' | 'FAILED';

/** Maps what `navigator.credentials.create/get` threw to what the user can do about it. */
export function ceremonyFailure(error: unknown): CeremonyFailure {
  const name = typeof error === 'object' && error !== null && 'name' in error ? String(error.name) : '';
  // The user dismissed the dialog, it timed out, or we aborted it for a newer attempt.
  if (name === 'NotAllowedError' || name === 'AbortError') return 'CANCELLED';
  // `excludeCredentials` matched: this authenticator already holds a passkey for the account.
  if (name === 'InvalidStateError') return 'ALREADY_REGISTERED';
  // Not a secure context, or the RP ID does not belong to this origin — a deployment problem.
  if (name === 'SecurityError') return 'NOT_ALLOWED_HERE';
  return 'FAILED';
}

/** Unpadded base64url. The Signal API rejects anything else with a TypeError. */
function isBase64Url(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length % 4 !== 1 && /^[A-Za-z0-9_-]+$/.test(value);
}

/**
 * Tell the passkey provider that the server does not know this credential, so
 * it stops offering it. `rpId` is always the server-provided one. Passive sync:
 * unsupported browsers skip it and failures never reach the user.
 */
export async function signalUnknownCredential(rpId: string | undefined, credentialId: string): Promise<void> {
  if (typeof window === 'undefined' || typeof window.PublicKeyCredential === 'undefined') return;
  if (typeof PublicKeyCredential.signalUnknownCredential !== 'function' || !rpId || !isBase64Url(credentialId)) return;
  try {
    await PublicKeyCredential.signalUnknownCredential({ rpId, credentialId });
  } catch (error) {
    console.warn('signalUnknownCredential skipped:', error);
  }
}

/** Tell the passkey provider which credentials this account still accepts, so removed ones disappear from its list. */
export async function signalAcceptedCredentials(rpId: string, userId: string, credentialIds: string[]): Promise<void> {
  if (typeof window === 'undefined' || typeof window.PublicKeyCredential === 'undefined') return;
  if (typeof PublicKeyCredential.signalAllAcceptedCredentials !== 'function') return;
  if (!rpId || !isBase64Url(userId) || !credentialIds.every(isBase64Url)) return;
  try {
    await PublicKeyCredential.signalAllAcceptedCredentials({ rpId, userId, allAcceptedCredentialIds: credentialIds });
  } catch (error) {
    console.warn('signalAllAcceptedCredentials skipped:', error);
  }
}
