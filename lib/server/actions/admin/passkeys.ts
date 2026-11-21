'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { requireVerifiedAdminIdentity } from '@/lib/auth/admin-session';
import {
  beginPasskeyRegistration,
  completePasskeyRegistration,
  relyingParty,
  removePasskey,
  type PasskeyRegistrationChallenge,
  type PasskeyRegistrationError,
  type PasskeyRegistrationStartError,
} from '@/lib/auth/passkeys';
import { actionDb } from '@/lib/server/actions/auth/_shared';

/**
 * An admin manages their OWN passkeys. Every action here needs both factors
 * already passed (requireVerifiedAdminIdentity) and takes the admin from the
 * session — the input never names whose passkey it is. Adding one additionally
 * needs a fresh TOTP code (checked in beginPasskeyRegistration).
 */
type Unavailable = { ok: false; error: 'PASSKEY_UNAVAILABLE' };

async function relyingPartyForRequest() {
  return relyingParty((await headers()).get('host'));
}

export async function beginPasskeyRegistrationAction(input: {
  code: string;
  label: string;
}): Promise<({ ok: true } & PasskeyRegistrationChallenge) | { ok: false; error: PasskeyRegistrationStartError } | Unavailable> {
  const identity = await requireVerifiedAdminIdentity();
  const rp = await relyingPartyForRequest();
  if (!rp) return { ok: false, error: 'PASSKEY_UNAVAILABLE' };
  return beginPasskeyRegistration(actionDb(), {
    adminUserId: identity.adminUserId,
    email: identity.email,
    sid: identity.sid,
    code: input?.code,
    label: input?.label,
    rp,
    now: new Date(),
  });
}

export async function finishPasskeyRegistrationAction(input: {
  token: string;
  response: unknown;
  label: string;
}): Promise<{ ok: true } | { ok: false; error: PasskeyRegistrationError } | Unavailable> {
  const identity = await requireVerifiedAdminIdentity();
  const rp = await relyingPartyForRequest();
  if (!rp) return { ok: false, error: 'PASSKEY_UNAVAILABLE' };
  const result = await completePasskeyRegistration(actionDb(), {
    adminUserId: identity.adminUserId,
    email: identity.email,
    sid: identity.sid,
    token: input?.token,
    response: input?.response,
    label: input?.label,
    rp,
    now: new Date(),
  });
  if (!result.ok) return result;
  revalidatePath('/passkeys');
  return { ok: true };
}

export async function removePasskeyAction(passkeyId: string): Promise<{ ok: true } | { ok: false; error: 'NOT_FOUND' }> {
  const identity = await requireVerifiedAdminIdentity();
  const result = await removePasskey(actionDb(), {
    adminUserId: identity.adminUserId,
    email: identity.email,
    passkeyId,
  });
  if (result.ok) revalidatePath('/passkeys');
  return result;
}
