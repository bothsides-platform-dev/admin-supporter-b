'use server';

import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { adminAuditLogs, workspaceNameChangeRequests, workspaces } from '@/lib/db/schema';
import { requireAdminSession } from '@/lib/auth/admin-session';
import { actionDb } from '@/lib/server/actions/auth/_shared';

// Admin actions accept an injected handle to keep the transaction boundary testable.

type DB = any;

const RequestId = z.string().uuid();
const RejectInput = z.object({
  requestId: z.string().uuid(),
  reason: z.string().trim().min(1).max(500),
}).strict();

type ReviewError = 'INVALID_INPUT' | 'REQUEST_NOT_PENDING' | 'WORKSPACE_NOT_ACTIVE';
export type WorkspaceNameChangeReviewResult =
  | { ok: true }
  | { ok: false; error: ReviewError };

class ReviewConflict extends Error {
  constructor(readonly code: Extract<ReviewError, 'WORKSPACE_NOT_ACTIVE'>) {
    super(code);
  }
}

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
): Promise<WorkspaceNameChangeReviewResult> {
  const session = await requireAdminSession();
  const parsedId = RequestId.safeParse(requestId);
  if (!parsedId.success) return { ok: false, error: 'INVALID_INPUT' };
  const now = new Date();

  try {
    const reviewed = await db.transaction(async (tx: DB) => {
      const [request] = await tx.select().from(workspaceNameChangeRequests)
        .where(eq(workspaceNameChangeRequests.id, parsedId.data)).limit(1);
      if (!request || request.status !== 'pending') {
        return { ok: false as const, error: 'REQUEST_NOT_PENDING' as const };
      }

      const [claimed] = await tx.update(workspaceNameChangeRequests).set({
        status: 'approved', reviewedBy: session.adminId, reviewedAt: now, reason: null,
      }).where(and(eq(workspaceNameChangeRequests.id, parsedId.data), eq(workspaceNameChangeRequests.status, 'pending')))
        .returning({ id: workspaceNameChangeRequests.id });
      if (!claimed) return { ok: false as const, error: 'REQUEST_NOT_PENDING' as const };

      const [workspace] = await tx.update(workspaces).set({ name: request.requestedName, updatedAt: now })
        .where(and(
          eq(workspaces.id, request.workspaceId),
          eq(workspaces.name, request.currentName),
          eq(workspaces.status, 'active'),
        ))
        .returning({ id: workspaces.id, type: workspaces.type });
      if (!workspace) throw new ReviewConflict('WORKSPACE_NOT_ACTIVE');

      await tx.insert(adminAuditLogs).values({
        actor: session.adminId,
        action: 'workspace.name_change_approve',
        entityType: 'workspace',
        entityId: request.workspaceId,
        payloadJson: { before: { name: request.currentName }, after: { name: request.requestedName } },
      });
      return { ok: true as const, workspaceId: workspace.id, workspaceType: workspace.type };
    });

    if (!reviewed.ok) return reviewed;
    revalidateWorkspaceNameChange(reviewed.workspaceId, reviewed.workspaceType, parsedId.data);
    return { ok: true };
  } catch (error) {
    if (error instanceof ReviewConflict) return { ok: false, error: error.code };
    throw error;
  }
}

export async function rejectWorkspaceNameChangeAction(
  db: DB = actionDb(),
  requestId: string,
  reason: string,
): Promise<WorkspaceNameChangeReviewResult> {
  const session = await requireAdminSession();
  const parsed = RejectInput.safeParse({ requestId, reason });
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };
  const now = new Date();

  const reviewed = await db.transaction(async (tx: DB) => {
    const [request] = await tx.select().from(workspaceNameChangeRequests)
      .where(eq(workspaceNameChangeRequests.id, parsed.data.requestId)).limit(1);
    if (!request || request.status !== 'pending') {
      return { ok: false as const, error: 'REQUEST_NOT_PENDING' as const };
    }

    const [claimed] = await tx.update(workspaceNameChangeRequests).set({
      status: 'rejected', reviewedBy: session.adminId, reviewedAt: now, reason: parsed.data.reason,
    }).where(and(eq(workspaceNameChangeRequests.id, parsed.data.requestId), eq(workspaceNameChangeRequests.status, 'pending')))
      .returning({ id: workspaceNameChangeRequests.id });
    if (!claimed) return { ok: false as const, error: 'REQUEST_NOT_PENDING' as const };

    const [workspace] = await tx.select({ type: workspaces.type }).from(workspaces)
      .where(eq(workspaces.id, request.workspaceId)).limit(1);
    await tx.insert(adminAuditLogs).values({
      actor: session.adminId,
      action: 'workspace.name_change_reject',
      entityType: 'workspace',
      entityId: request.workspaceId,
      payloadJson: { before: { name: request.currentName }, after: { name: request.currentName }, reason: parsed.data.reason },
    });
    return { ok: true as const, workspaceId: request.workspaceId, workspaceType: workspace?.type ?? null };
  });

  if (!reviewed.ok) return reviewed;
  revalidateWorkspaceNameChange(reviewed.workspaceId, reviewed.workspaceType, parsed.data.requestId);
  return { ok: true };
}
