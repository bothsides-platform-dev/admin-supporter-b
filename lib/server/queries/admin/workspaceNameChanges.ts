import { desc, eq } from 'drizzle-orm';
import { users, workspaceNameChangeRequests, workspaces } from '@/lib/db/schema';
import { actionDb } from '@/lib/server/actions/auth/_shared';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = any;

export const WORKSPACE_NAME_CHANGE_PAGE_SIZE = 100;

export type WorkspaceNameChangeRequestRow = {
  id: string;
  workspaceId: string;
  workspaceType: 'buyer' | 'pg' | null;
  requesterName: string | null;
  requesterEmail: string | null;
  currentName: string;
  requestedName: string;
  status: string;
  reason: string | null;
  reviewedBy: string | null;
  submittedAt: Date;
  reviewedAt: Date | null;
};

export async function listWorkspaceNameChangeRequests(
  opts: { status?: string } = {},
  db: DB = actionDb(),
): Promise<WorkspaceNameChangeRequestRow[]> {
  const rows = await db.select({
    id: workspaceNameChangeRequests.id,
    workspaceId: workspaceNameChangeRequests.workspaceId,
    workspaceType: workspaces.type,
    requesterName: users.name,
    requesterEmail: users.email,
    currentName: workspaceNameChangeRequests.currentName,
    requestedName: workspaceNameChangeRequests.requestedName,
    status: workspaceNameChangeRequests.status,
    reason: workspaceNameChangeRequests.reason,
    reviewedBy: workspaceNameChangeRequests.reviewedBy,
    submittedAt: workspaceNameChangeRequests.submittedAt,
    reviewedAt: workspaceNameChangeRequests.reviewedAt,
  }).from(workspaceNameChangeRequests)
    .leftJoin(workspaces, eq(workspaceNameChangeRequests.workspaceId, workspaces.id))
    .leftJoin(users, eq(workspaceNameChangeRequests.requestedByUserId, users.id))
    .where(opts.status ? eq(workspaceNameChangeRequests.status, opts.status) : undefined)
    .orderBy(desc(workspaceNameChangeRequests.submittedAt), desc(workspaceNameChangeRequests.id))
    .limit(WORKSPACE_NAME_CHANGE_PAGE_SIZE);
  return rows as WorkspaceNameChangeRequestRow[];
}
