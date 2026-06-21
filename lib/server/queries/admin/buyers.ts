import { and, desc, eq, ilike } from 'drizzle-orm';
import { workspaces, rfps, bizProfiles } from '@/lib/db/schema';
import { actionDb } from '@/lib/server/actions/auth/_shared';
import type { MerchantGrade } from '@/lib/types/biz-profile';

export type BuyerRow = {
  id: string;
  name: string;
  status: 'pending' | 'active' | 'suspended';
  createdAt: Date;
};

export type RfpRow = {
  id: string;
  code: string;
  title: string;
  status: 'draft' | 'sent' | 'closed' | 'cancelled' | 'awarded';
  deadline: Date;
  createdAt: Date;
};

export type WorkspaceFullRow = typeof workspaces.$inferSelect;

export async function listBuyers(
  opts: { q?: string; status?: string } = {},
): Promise<BuyerRow[]> {
  const { q, status } = opts;
  const rows = await actionDb()
    .select({
      id: workspaces.id,
      name: workspaces.name,
      status: workspaces.status,
      createdAt: workspaces.createdAt,
    })
    .from(workspaces)
    .where(
      and(
        eq(workspaces.type, 'buyer'),
        q ? ilike(workspaces.name, `%${q}%`) : undefined,
        status && status !== 'all'
          ? eq(workspaces.status, status as 'pending' | 'active' | 'suspended')
          : undefined,
      ),
    )
    .orderBy(desc(workspaces.createdAt));
  return rows as BuyerRow[];
}

export async function getBuyerDetail(workspaceId: string) {
  const wsRows = await actionDb()
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId));
  const ws = wsRows[0] as WorkspaceFullRow | undefined;
  if (!ws) return null;

  const buyerRfps = (await actionDb()
    .select({
      id: rfps.id,
      code: rfps.code,
      title: rfps.title,
      status: rfps.status,
      deadline: rfps.deadline,
      createdAt: rfps.createdAt,
    })
    .from(rfps)
    .where(eq(rfps.buyerWsId, workspaceId))
    .orderBy(desc(rfps.createdAt))) as RfpRow[];

  // 현재 영중소구간(가맹점 등급) — bizProfileId 포인터가 가리키는 행에서 조회.
  let grade: MerchantGrade | null = null;
  if (ws.bizProfileId) {
    const [bp] = await actionDb()
      .select({ grade: bizProfiles.grade })
      .from(bizProfiles)
      .where(eq(bizProfiles.id, ws.bizProfileId));
    grade = (bp?.grade as MerchantGrade | null) ?? null;
  }

  return { workspace: ws, rfps: buyerRfps, grade };
}
