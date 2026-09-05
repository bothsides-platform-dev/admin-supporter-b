'use server';

import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { adminAuditLogs, workspaceNameChangeRequests, workspaces } from '@/lib/db/schema';
import { requireAdminSession } from '@/lib/auth/admin-session';
import { actionDb } from '@/lib/server/actions/auth/_shared';

// Admin actions accept an injected handle to keep the transaction boundary testable.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = any;

function revalidateWorkspaceNameChange(workspaceId: string, workspaceType: string | null, requestId: string) {
  revalidatePath('/name-change-requests');
  revalidatePath(`/name-change-requests/${requestId}`);
  if (workspaceType) {
    revalidatePath(workspaceType === 'buyer' ? `/buyers/${workspaceId}` : `/sellers/${workspaceId}`);
  }
}

export async function approveWorkspaceNameChangeAction(
  db: DB = actionDb(),
  requestId: string,
): Promise<void> {
  const session = await requireAdminSession();
  const now = new Date();

  const reviewed = await db.transaction(async (tx: DB) => {
    const [request] = await tx.select().from(workspaceNameChangeRequests)
      .where(eq(workspaceNameChangeRequests.id, requestId)).limit(1);
    if (!request || request.status !== 'pending') throw new Error('REQUEST_NOT_PENDING');

    const [claimed] = await tx.update(workspaceNameChangeRequests).set({
      status: 'approved', reviewedBy: session.adminId, reviewedAt: now, reason: null,
    }).where(and(eq(workspaceNameChangeRequests.id, requestId), eq(workspaceNameChangeRequests.status, 'pending')))
      .returning({ id: workspaceNameChangeRequests.id });
    if (!claimed) throw new Error('REQUEST_NOT_PENDING');

    const [workspace] = await tx.update(workspaces).set({ name: request.requestedName, updatedAt: now })
      .where(and(
        eq(workspaces.id, request.workspaceId),
        eq(workspaces.name, request.currentName),
        eq(workspaces.status, 'active'),
      ))
      .returning({ id: workspaces.id, type: workspaces.type });
    if (!workspace) throw new Error('WORKSPACE_NOT_ACTIVE');

    await tx.insert(adminAuditLogs).values({
      actor: session.adminId,
      action: 'workspace.name_change_approve',
      entityType: 'workspace',
      entityId: request.workspaceId,
      payloadJson: { before: { name: request.currentName }, after: { name: request.requestedName } },
    });
    return { workspaceId: workspace.id, workspaceType: workspace.type };
  });

  revalidateWorkspaceNameChange(reviewed.workspaceId, reviewed.workspaceType, requestId);
}

export async function rejectWorkspaceNameChangeAction(
  db: DB = actionDb(),
  requestId: string,
  reason: string,
): Promise<void> {
  const session = await requireAdminSession();
  const normalizedReason = reason.trim();
  if (!normalizedReason) throw new Error('REASON_REQUIRED');
  const now = new Date();

  const reviewed = await db.transaction(async (tx: DB) => {
    const [request] = await tx.select().from(workspaceNameChangeRequests)
      .where(eq(workspaceNameChangeRequests.id, requestId)).limit(1);
    if (!request || request.status !== 'pending') throw new Error('REQUEST_NOT_PENDING');

    const [claimed] = await tx.update(workspaceNameChangeRequests).set({
      status: 'rejected', reviewedBy: session.adminId, reviewedAt: now, reason: normalizedReason,
    }).where(and(eq(workspaceNameChangeRequests.id, requestId), eq(workspaceNameChangeRequests.status, 'pending')))
      .returning({ id: workspaceNameChangeRequests.id });
    if (!claimed) throw new Error('REQUEST_NOT_PENDING');

    const [workspace] = await tx.select({ type: workspaces.type }).from(workspaces)
      .where(eq(workspaces.id, request.workspaceId)).limit(1);
    await tx.insert(adminAuditLogs).values({
      actor: session.adminId,
      action: 'workspace.name_change_reject',
      entityType: 'workspace',
      entityId: request.workspaceId,
      payloadJson: { before: { name: request.currentName }, after: { name: request.currentName }, reason: normalizedReason },
    });
    return { workspaceId: request.workspaceId, workspaceType: workspace?.type ?? null };
  });

  revalidateWorkspaceNameChange(reviewed.workspaceId, reviewed.workspaceType, requestId);
}
