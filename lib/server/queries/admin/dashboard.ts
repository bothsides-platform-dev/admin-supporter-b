import { count, eq, and, lte, gt } from 'drizzle-orm';
import { actionDb } from '@/lib/server/actions/auth/_shared';
import { workspaces, rfps } from '@/lib/db/schema';

type DB = ReturnType<typeof actionDb>;

export interface DashboardStats {
  /** 심사 대기 중인 워크스페이스 수 (status = 'pending') */
  pendingReviewCount: number;
  /** 진행 중인 RFP 수 (status = 'sent') */
  activeRfpCount: number;
}

export interface HotlistItem {
  type: 'deadline_approaching';
  label: string;
  subLabel: string;
  entityId: string;
  href: string;
}

export async function getDashboardStats(db: DB = actionDb()): Promise<DashboardStats> {
  const [pendingRows, activeRfpRows] = await Promise.all([
    // 심사 대기 워크스페이스 (status = 'pending')
    db
      .select({ count: count() })
      .from(workspaces)
      .where(eq(workspaces.status, 'pending')),

    // 진행 중 RFP (status = 'sent')
    db
      .select({ count: count() })
      .from(rfps)
      .where(eq(rfps.status, 'sent')),
  ]);

  return {
    pendingReviewCount: Number(pendingRows[0].count),
    activeRfpCount: Number(activeRfpRows[0].count),
  };
}

export async function getHotlist(db: DB = actionDb()): Promise<HotlistItem[]> {
  const now = new Date();
  const cutoff48h = new Date(now.getTime() + 48 * 3600 * 1000);

  // 마감 임박 RFP: sent, deadline within 48h (미래), 마감 순 정렬
  const approachingRfps = await db
    .select({
      id: rfps.id,
      code: rfps.code,
      title: rfps.title,
      deadline: rfps.deadline,
    })
    .from(rfps)
    .where(
      and(
        eq(rfps.status, 'sent'),
        gt(rfps.deadline, now),
        lte(rfps.deadline, cutoff48h),
      ),
    )
    .orderBy(rfps.deadline)
    .limit(10);

  const items: HotlistItem[] = [];

  for (const rfp of approachingRfps) {
    const hoursLeft = Math.ceil(
      (new Date(rfp.deadline).getTime() - now.getTime()) / 3600_000,
    );
    items.push({
      type: 'deadline_approaching',
      label: rfp.title,
      subLabel: `마감 ${hoursLeft}시간 전 · ${rfp.code}`,
      entityId: rfp.id,
      href: `/rfps/${rfp.code}`,
    });
  }

  return items;
}
