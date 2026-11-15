'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { requireAdminIdentity } from '@/lib/auth/admin-session';
import { attemptTotp } from '@/lib/auth/admin-users';
import { safeLoginDestination } from '@/lib/auth/login-destination';
import { MFA_COOKIE_NAME, mfaCookieOptions, signMfaCookie } from '@/lib/auth/mfa-cookie';
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
