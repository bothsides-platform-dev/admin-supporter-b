import { auth } from '@/auth';
import { redirect } from 'next/navigation';

export type AdminRole = 'operator' | 'super_admin';

export type AdminSession = {
  adminId: string;
  role: AdminRole;
};

function getAllowedEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

function getSuperAdminEmails(): string[] {
  return (process.env.ADMIN_SUPER_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export async function requireAdminSession(): Promise<AdminSession> {
  const session = await auth();
  if (!session?.user?.email) redirect('/login');

  const email = session.user.email.toLowerCase();
  if (!getAllowedEmails().includes(email)) redirect('/login');

  const role: AdminRole = getSuperAdminEmails().includes(email) ? 'super_admin' : 'operator';
  return { adminId: email, role };
}

export async function requireSuperAdmin(): Promise<AdminSession> {
  const session = await requireAdminSession();
  if (session.role !== 'super_admin') redirect('/');
  return session;
}
