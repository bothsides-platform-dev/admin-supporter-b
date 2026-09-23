import { auth } from '@/auth';
import { redirect } from 'next/navigation';

import { hasPermission, type AdminPermission, type AdminRole } from './permissions';
export type { AdminRole } from './permissions';

export type AdminSession = {
  adminId: string;
  role: AdminRole;
};

function parseEmailList(value: string | undefined): string[] {
  return (value ?? '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
}

export async function requireAdminSession(): Promise<AdminSession> {
  const session = await auth();
  if (!session?.user?.email) redirect('/login');

  const email = session.user.email.toLowerCase();
  // When ADMIN_EMAILS is unset, parseEmailList returns [] — fail closed.
  if (!parseEmailList(process.env.ADMIN_EMAILS).includes(email)) redirect('/login?error=AccessDenied');

  // Current operating policy: every allowlisted administrator is a super admin.
  // Keep role/permission checks in callers so a future role resolver can replace
  // this assignment without changing individual pages or server actions.
  const role: AdminRole = 'super_admin';
  return { adminId: email, role };
}

export async function requireSuperAdmin(): Promise<AdminSession> {
  const session = await requireAdminSession();
  // User is authenticated but lacks super_admin role — send to dashboard, not login.
  if (session.role !== 'super_admin') redirect('/');
  return session;
}

export async function requireAdminPermission(permission: AdminPermission): Promise<AdminSession> {
  const session = await requireAdminSession();
  if (!hasPermission(session, permission)) redirect('/?error=PermissionDenied');
  return session;
}
