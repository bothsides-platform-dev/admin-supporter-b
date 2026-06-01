import { and, desc, eq, ilike } from 'drizzle-orm';
import { workspaces, bids, pgProfiles } from '@/lib/db/schema';
import { actionDb } from '@/lib/server/actions/auth/_shared';
import { getWorkspaceAdminUser } from './workspaceOwner';

export type SellerRow = {
  id: string;
  name: string;
  status: 'pending' | 'active' | 'suspended';
  createdAt: Date;
};

export type BidRow = {
  id: string;
  rfpId: string;
  status: 'draft' | 'submitted' | 'withdrawn';
  submittedAt: Date;
};

export type WorkspaceFullRow = typeof workspaces.$inferSelect;
export type PgProfileRow = typeof pgProfiles.$inferSelect;

export async function listSellers(
  opts: { q?: string; status?: string } = {},
): Promise<SellerRow[]> {
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
        eq(workspaces.type, 'pg'),
        q ? ilike(workspaces.name, `%${q}%`) : undefined,
        status && status !== 'all'
          ? eq(workspaces.status, status as 'pending' | 'active' | 'suspended')
          : undefined,
      ),
    )
    .orderBy(desc(workspaces.createdAt));
  return rows as SellerRow[];
}

export async function getSellerDetail(workspaceId: string) {
  const wsRows = await actionDb()
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId));
  const ws = wsRows[0] as WorkspaceFullRow | undefined;
  if (!ws) return null;

  const profileRows = await actionDb()
    .select()
    .from(pgProfiles)
    .where(eq(pgProfiles.workspaceId, workspaceId));
  const profile = profileRows[0] as PgProfileRow | undefined;

  const sellerBids = (await actionDb()
    .select({
      id: bids.id,
      rfpId: bids.rfpId,
      status: bids.status,
      submittedAt: bids.submittedAt,
    })
    .from(bids)
    .where(eq(bids.pgWsId, workspaceId))
    .orderBy(desc(bids.submittedAt))
    .limit(20)) as BidRow[];

  const ownerContact = await getWorkspaceAdminUser(workspaceId);

  return { workspace: ws, pgProfile: profile ?? null, bids: sellerBids, ownerContact };
}
