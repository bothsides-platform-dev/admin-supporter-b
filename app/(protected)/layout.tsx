import { requireAdminSession } from '@/lib/auth/admin-session';
import { AdminShell } from '@/components/AdminShell';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAdminSession();
  return <AdminShell role={session.role} adminId={session.adminId}>{children}</AdminShell>;
}
