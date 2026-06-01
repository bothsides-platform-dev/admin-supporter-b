import { auth } from '@/auth';
import { redirect } from 'next/navigation';

export async function requireAdminSession(): Promise<{ adminId: string }> {
  const session = await auth();
  if (!session?.user?.email) redirect('/login');
  return { adminId: session.user.email };
}
