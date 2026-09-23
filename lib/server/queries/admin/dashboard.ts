import { count, eq, and, lte, gt } from 'drizzle-orm';
import { actionDb } from '@/lib/server/actions/auth/_shared';
import { workspaces, rfps, verificationApplications, workspaceNameChangeRequests, workspaceMembers } from '@/lib/db/schema';

type DB = ReturnType<typeof actionDb>;

export interface DashboardStats {
  /** 신규 입점 신청 (status = 'submitted') */
  pendingReviewCount: number;
  /** 진행 중인 RFP 수 (status = 'sent') */
  activeRfpCount: number;
  pendingNameChangeCount: number;
  pendingMemberCount: number;
}

export interface HotlistItem {
  type: 'deadline_approaching';
  label: string;
  subLabel: string;
  entityId: string;
  href: string;
}

export async function getDashboardStats(db: DB = actionDb()): Promise<DashboardStats> {
  const [pendingRows, activeRfpRows, nameRows, memberRows] = await Promise.all([
    // 목록 링크와 같은 상태를 집계한다.
    db
      .select({ count: count() })
      .from(verificationApplications)
      .where(eq(verificationApplications.status, 'submitted')),

    // 진행 중 RFP (status = 'sent')
    db
      .select({ count: count() })
      .from(rfps)
      .where(eq(rfps.status, 'sent')),
    db.select({ count: count() }).from(workspaceNameChangeRequests).where(eq(workspaceNameChangeRequests.status, 'pending')),
    db.select({ count: count() }).from(workspaceMembers)
      .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
      .where(and(eq(workspaces.type, 'pg'), eq(workspaceMembers.approvalStatus, 'pending_approval'))),
  ]);

  return {
    pendingReviewCount: Number(pendingRows[0].count),
    activeRfpCount: Number(activeRfpRows[0].count),
    pendingNameChangeCount: Number(nameRows[0].count),
    pendingMemberCount: Number(memberRows[0].count),
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
      href: `/rfps/${rfp.id}`,
    });
  }

  return items;
}

export async function getOldestApplications(db: DB = actionDb()) {
  const rows = await db.select({ id: verificationApplications.id, name: workspaces.name, submittedAt: verificationApplications.submittedAt })
    .from(verificationApplications).innerJoin(workspaces, eq(workspaces.id, verificationApplications.workspaceId))
    .where(eq(verificationApplications.status, 'submitted'))
    .orderBy(verificationApplications.submittedAt, verificationApplications.id).limit(5);
  const now = Date.now();
  return rows.map(row => ({ ...row, waitingDays: Math.max(0, Math.floor((now - row.submittedAt.getTime()) / 86400000)) }));
}
