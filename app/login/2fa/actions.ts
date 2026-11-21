'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { requireAdminIdentity } from '@/lib/auth/admin-session';
import { attemptTotp } from '@/lib/auth/admin-users';
import { safeLoginDestination } from '@/lib/auth/login-destination';
import { MFA_COOKIE_NAME, mfaCookieOptions, signMfaCookie } from '@/lib/auth/mfa-cookie';
import { completePasskeySignIn, relyingParty, type PasskeySignInError } from '@/lib/auth/passkeys';
import { actionDb } from '@/lib/server/actions/auth/_shared';

/**
 * One action for both enrollment confirmation and sign-in: which one applies is
 * decided from the admin's current DB row, never from the form.
 */
export async function submitTotpAction(formData: FormData) {
  const identity = await requireAdminIdentity();
  const destination = safeLoginDestination(formData.get('callbackUrl'));
  const now = new Date();

  const result = await attemptTotp(actionDb(), identity.email, formData.get('code'), now);
  if (!result.ok) {
    redirect(`/login/2fa?${new URLSearchParams({ callbackUrl: destination, error: result.error })}`);
  }

  const jar = await cookies();
  jar.set(
    MFA_COOKIE_NAME,
    signMfaCookie({ email: identity.email, sid: identity.sid, enabledAt: result.enabledAt, now }),
    mfaCookieOptions,
  );
  redirect(destination);
}

export type PasskeySignInFailure = { ok: false; error: PasskeySignInError | 'PASSKEY_UNAVAILABLE' };

/**
 * Second factor by passkey. Returns only on failure: success sets the same 2FA
 * cookie a TOTP code does (bound to this login and the TOTP enrollment time)
 * and redirects. Called from a client event handler, so every field is
 * untrusted — the admin comes from the session, never from the input.
 */
export async function passkeySignInAction(input: {
  token: string;
  response: unknown;
  callbackUrl: string;
}): Promise<PasskeySignInFailure> {
  const identity = await requireAdminIdentity();
  const destination = safeLoginDestination(input?.callbackUrl);
  const rp = relyingParty((await headers()).get('host'));
  if (!rp) return { ok: false, error: 'PASSKEY_UNAVAILABLE' };
  const now = new Date();

  const result = await completePasskeySignIn(actionDb(), {
    adminUserId: identity.adminUserId,
    email: identity.email,
    sid: identity.sid,
    token: input?.token,
    response: input?.response,
    rp,
    now,
  });
  if (!result.ok) return result;

  const jar = await cookies();
  jar.set(
    MFA_COOKIE_NAME,
    signMfaCookie({ email: identity.email, sid: identity.sid, enabledAt: result.enabledAt, now }),
    mfaCookieOptions,
  );
  redirect(destination);
}
