import { auth } from '@/auth';
import { redirect } from 'next/navigation';

export type AdminRole = 'operator' | 'super_admin';

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
  if (!parseEmailList(process.env.ADMIN_EMAILS).includes(email)) redirect('/login');

  // ADMIN_SUPER_EMAILS must be a strict subset of ADMIN_EMAILS.
  // An address in ADMIN_SUPER_EMAILS absent from ADMIN_EMAILS is denied at the line above.
  const role: AdminRole = parseEmailList(process.env.ADMIN_SUPER_EMAILS).includes(email)
    ? 'super_admin'
    : 'operator';
  return { adminId: email, role };
}

export async function requireSuperAdmin(): Promise<AdminSession> {
  const session = await requireAdminSession();
  // User is authenticated but lacks super_admin role — send to dashboard, not login.
  if (session.role !== 'super_admin') redirect('/');
  return session;
}
