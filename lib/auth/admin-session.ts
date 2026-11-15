import { auth } from '@/auth';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';

import { actionDb } from '@/lib/server/actions/auth/_shared';
import { findAdminByEmail } from './admin-users';
import { MFA_COOKIE_NAME, verifyMfaCookie } from './mfa-cookie';
import { hasPermission, type AdminPermission, type AdminRole } from './permissions';
export type { AdminRole } from './permissions';

export type AdminSession = {
  /** Admin email — the actor recorded in audit logs. */
  adminId: string;
  adminUserId: string;
  role: AdminRole;
};

/** First factor only: Google session (with a login session id) + allowlisted in `admin_users`. */
export type AdminIdentity = {
  adminUserId: string;
  email: string;
  sid: string;
  totpEnabledAt: Date | null;
};

const loadAdmin = cache((email: string) => findAdminByEmail(actionDb(), email));

/**
 * For the 2FA page and its action only. Everything else must use
 * requireAdminSession / requireAdminPermission.
 */
export async function requireAdminIdentity(): Promise<AdminIdentity> {
  const session = await auth();
  const email = session?.user?.email?.trim().toLowerCase();
  // Sessions issued before 2FA existed carry no sid → force a fresh Google login.
  if (!email || !session?.sid) redirect('/login');
  const admin = await loadAdmin(email);
  if (!admin) redirect('/login?error=AccessDenied');
  return { adminUserId: admin.id, email, sid: session.sid, totpEnabledAt: admin.totpEnabledAt };
}

/**
 * THE second-factor predicate. The 2FA page's "already passed" check and
 * requireAdminSession must both use this (the proxy's check is weaker — it
 * cannot see totpEnabledAt — and using it on the 2FA page would loop after a
 * 2FA reset).
 */
export function hasPassedMfa(identity: AdminIdentity, cookieValue: string | undefined, now: Date): boolean {
  if (!identity.totpEnabledAt) return false;
  return verifyMfaCookie({
    value: cookieValue,
    email: identity.email,
    sid: identity.sid,
    enabledAt: identity.totpEnabledAt,
    now,
  });
}

export async function requireAdminSession(): Promise<AdminSession> {
  const identity = await requireAdminIdentity();
  const jar = await cookies();
  if (!hasPassedMfa(identity, jar.get(MFA_COOKIE_NAME)?.value, new Date())) redirect('/login/2fa');

  // Current operating policy: every allowlisted administrator is a super admin.
  // Keep role/permission checks in callers so a future role resolver can replace
  // this assignment without changing individual pages or server actions.
  const role: AdminRole = 'super_admin';
  return { adminId: identity.email, adminUserId: identity.adminUserId, role };
}

export async function requireAdminPermission(permission: AdminPermission): Promise<AdminSession> {
  const session = await requireAdminSession();
  if (!hasPermission(session, permission)) redirect('/?error=PermissionDenied');
  return session;
}
