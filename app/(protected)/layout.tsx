import { requireAdminSession } from '@/lib/auth/admin-session';
import { AdminShell } from '@/components/AdminShell';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdminSession();
  return <AdminShell>{children}</AdminShell>;
}
