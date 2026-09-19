'use server';

import { randomUUID } from 'node:crypto';
import { and, eq, inArray, notInArray } from 'drizzle-orm';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { adminAuditLogs, pgRecommendationGroups, pgRecommendationMembers, workspaces } from '@/lib/db/schema';
import { requireAdminSession } from '@/lib/auth/admin-session';

const SaveInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(60),
  sortOrder: z.number().int().min(0).max(1000),
  pgWorkspaceIds: z.array(z.string().uuid()).max(500),
}).strict();

type SaveResult = { ok: true; id: string } | { ok: false; error: string };
type DeleteResult = { ok: true } | { ok: false; error: string };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = any;

export async function savePgRecommendationGroupAction(
  db: DB,
  input: z.input<typeof SaveInput>,
): Promise<SaveResult> {
  const session = await requireAdminSession();
  const parsed = SaveInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };
  const { id: inputId, name, sortOrder } = parsed.data;
  const pgWorkspaceIds = [...new Set(parsed.data.pgWorkspaceIds)];

  try {
    const result: SaveResult = await db.transaction(async (tx: DB) => {
      const pgRows = pgWorkspaceIds.length > 0
        ? await tx.select({ id: workspaces.id, type: workspaces.type })
          .from(workspaces).where(inArray(workspaces.id, pgWorkspaceIds))
        : [];
      if (pgRows.length !== pgWorkspaceIds.length || pgRows.some((row: { type: string }) => row.type !== 'pg')) {
        return { ok: false, error: 'PG_WORKSPACE_REQUIRED' };
      }

      const before = inputId
        ? (await tx.select({ id: pgRecommendationGroups.id, name: pgRecommendationGroups.name, sortOrder: pgRecommendationGroups.sortOrder })
          .from(pgRecommendationGroups).where(eq(pgRecommendationGroups.id, inputId)).limit(1))[0]
        : null;
      if (inputId && !before) return { ok: false, error: 'GROUP_NOT_FOUND' };

      const id = inputId ?? randomUUID();
      const beforeMembers = inputId
        ? await tx.select({ pgWsId: pgRecommendationMembers.pgWsId })
          .from(pgRecommendationMembers).where(eq(pgRecommendationMembers.groupId, inputId))
        : [];

      if (inputId) {
        await tx.update(pgRecommendationGroups)
          .set({ name, sortOrder, updatedAt: new Date() })
          .where(eq(pgRecommendationGroups.id, inputId));
      } else {
        await tx.insert(pgRecommendationGroups).values({ id, name, sortOrder });
      }

      await tx.delete(pgRecommendationMembers).where(
        pgWorkspaceIds.length > 0
          ? and(eq(pgRecommendationMembers.groupId, id), notInArray(pgRecommendationMembers.pgWsId, pgWorkspaceIds))
          : eq(pgRecommendationMembers.groupId, id),
      );
      if (pgWorkspaceIds.length > 0) {
        await tx.insert(pgRecommendationMembers)
          .values(pgWorkspaceIds.map((pgWsId) => ({ pgWsId, groupId: id })))
          .onConflictDoUpdate({ target: pgRecommendationMembers.pgWsId, set: { groupId: id } });
      }

      await tx.insert(adminAuditLogs).values({
        actor: session.adminId,
        action: 'pg_recommendation.group_save',
        entityType: 'pg_recommendation_group',
        entityId: id,
        payloadJson: {
          before: before ? { name: before.name, sortOrder: before.sortOrder, pgWorkspaceIds: beforeMembers.map((row: { pgWsId: string }) => row.pgWsId) } : {},
          after: { name, sortOrder, pgWorkspaceIds },
        },
      });
      return { ok: true, id };
    });
    if (result.ok) revalidatePath('/pg-recommendations');
    return result;
  } catch (error) {
    if ((error as { code?: string }).code === '23505') return { ok: false, error: 'DUPLICATE_GROUP_NAME' };
    throw error;
  }
}

export async function deletePgRecommendationGroupAction(db: DB, groupId: string): Promise<DeleteResult> {
  const session = await requireAdminSession();
  if (!z.string().uuid().safeParse(groupId).success) return { ok: false, error: 'INVALID_INPUT' };

  const result: DeleteResult = await db.transaction(async (tx: DB) => {
    const [group] = await tx.delete(pgRecommendationGroups)
      .where(eq(pgRecommendationGroups.id, groupId))
      .returning({ id: pgRecommendationGroups.id, name: pgRecommendationGroups.name });
    if (!group) return { ok: false, error: 'GROUP_NOT_FOUND' };
    await tx.insert(adminAuditLogs).values({
      actor: session.adminId,
      action: 'pg_recommendation.group_delete',
      entityType: 'pg_recommendation_group',
      entityId: groupId,
      payloadJson: { before: { name: group.name }, after: {} },
    });
    return { ok: true };
  });
  if (result.ok) revalidatePath('/pg-recommendations');
  return result;
}
