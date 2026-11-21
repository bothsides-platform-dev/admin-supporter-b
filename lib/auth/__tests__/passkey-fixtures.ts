import type { DB } from '@/lib/db/index';
import { attemptTotp, ensurePendingTotpSecret } from '../admin-users';
import { beginPasskeyRegistration, completePasskeyRegistration, type RelyingParty } from '../passkeys';
import { totpCodeAt, totpStep } from '../totp';
import type { SoftwareAuthenticator } from './software-authenticator';

/** RP used by action/page tests; they stub AUTH_URL to this origin. */
export const TEST_RP: RelyingParty = { rpID: 'admin.example.com', origin: 'https://admin.example.com' };

/**
 * Enrolls an existing admin row in TOTP (two minutes ago) and, when an
 * authenticator is given, registers its passkey (a minute ago) through the real
 * registration path. The times are in the past so "now" can issue fresh codes.
 */
export async function enrollAdmin(db: DB, admin: { adminUserId: string; email: string; sid: string }, authenticator?: SoftwareAuthenticator) {
  const enrolledAt = new Date(Date.now() - 120_000);
  const registeredAt = new Date(Date.now() - 60_000);
  const secret = (await ensurePendingTotpSecret(db, admin.adminUserId, enrolledAt))!;
  const enrolled = await attemptTotp(db, admin.email, totpCodeAt(secret, totpStep(enrolledAt)), enrolledAt);
  if (!enrolled.ok) throw new Error(`enrollment failed: ${enrolled.error}`);

  if (authenticator) {
    const started = await beginPasskeyRegistration(db, {
      ...admin, code: totpCodeAt(secret, totpStep(registeredAt)), label: '회사 맥북', rp: TEST_RP, now: registeredAt,
    });
    if (!started.ok) throw new Error(`registration could not start: ${started.error}`);
    const finished = await completePasskeyRegistration(db, {
      ...admin, token: started.token, label: '회사 맥북', rp: TEST_RP, now: new Date(registeredAt.getTime() + 1_000),
      response: authenticator.register({ challenge: started.options.challenge, origin: TEST_RP.origin, rpID: TEST_RP.rpID }),
    });
    if (!finished.ok) throw new Error(`registration failed: ${finished.error}`);
  }
  return { ...admin, secret, totpEnabledAt: enrolled.enabledAt };
}
