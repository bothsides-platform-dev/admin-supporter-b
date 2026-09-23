import { and, asc, desc, eq, gte, ilike, lt, sql } from 'drizzle-orm';
import { ADMIN_PAGE_SIZE, dateBounds, pageNumber, type ListParams } from '@/lib/admin-list';
import { workspaces, rfps, bizProfiles } from '@/lib/db/schema';
import { actionDb } from '@/lib/server/actions/auth/_shared';
import type { MerchantTier } from '@/lib/types/biz-profile';

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

export async function listBuyersPage(opts: ListParams = {}) {
  const { fromDate, toDate } = dateBounds(opts.from, opts.to);
  const where = and(eq(workspaces.type, 'buyer'), opts.q ? ilike(workspaces.name, `%${opts.q}%`) : undefined,
    ['pending', 'active', 'suspended'].includes(opts.status ?? '') ? eq(workspaces.status, opts.status as 'pending' | 'active' | 'suspended') : undefined,
    fromDate ? gte(workspaces.createdAt, fromDate) : undefined, toDate ? lt(workspaces.createdAt, toDate) : undefined);
  const db = actionDb();
  const [{ total }] = await db.select({ total: sql<number>`cast(count(*) as int)` }).from(workspaces).where(where);
  const page = Math.min(pageNumber(opts.page), Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE)));
  const order = opts.sort === 'oldest' ? [asc(workspaces.createdAt), asc(workspaces.id)] : opts.sort === 'name' ? [asc(workspaces.name), asc(workspaces.id)] : [desc(workspaces.createdAt), desc(workspaces.id)];
  const rows = await db.select({ id: workspaces.id, name: workspaces.name, status: workspaces.status, createdAt: workspaces.createdAt })
    .from(workspaces).where(where).orderBy(...order).limit(ADMIN_PAGE_SIZE).offset((page - 1) * ADMIN_PAGE_SIZE);
  return { rows: rows as BuyerRow[], total, page };
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
  let grade: MerchantTier | null = null;
  if (ws.bizProfileId) {
    const [bp] = await actionDb()
      .select({ grade: bizProfiles.grade })
      .from(bizProfiles)
      .where(eq(bizProfiles.id, ws.bizProfileId));
    grade = (bp?.grade as MerchantTier | null) ?? null;
  }

  return { workspace: ws, rfps: buyerRfps, grade };
}
