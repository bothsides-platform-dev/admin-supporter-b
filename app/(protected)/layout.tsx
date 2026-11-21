import { requireAdminSession } from '@/lib/auth/admin-session';
import { AdminShell } from '@/components/AdminShell';
import type { AdminNavigationCounts } from '@/lib/admin-navigation';
import { getDashboardStats } from '@/lib/server/queries/admin/dashboard';

/** 메뉴 뱃지용 대기 건수. 조회가 실패해도 화면은 떠야 하므로 뱃지만 생략한다. */
async function navigationCounts(): Promise<AdminNavigationCounts> {
  try {
    const stats = await getDashboardStats();
    return { review: stats.openReviewCount, nameChange: stats.pendingNameChangeCount, pgMembers: stats.pendingMemberCount };
  } catch {
    return {};
  }
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAdminSession();
  const counts = await navigationCounts();
  return <AdminShell role={session.role} adminId={session.adminId} counts={counts}>{children}</AdminShell>;
}
