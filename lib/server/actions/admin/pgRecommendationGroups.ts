'use server';

import { MCC_INDUSTRIES, MCC_VERSION } from '@/lib/mcc-catalog';
import { randomUUID } from 'node:crypto';
import { and, eq, inArray, notInArray } from 'drizzle-orm';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { adminAuditLogs, pgRecommendationGroups, pgRecommendationMembers, workspaces } from '@/lib/db/schema';
import { requireAdminPermission } from '@/lib/auth/admin-session';

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
  const session = await requireAdminPermission('recommendation.edit');
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
  const session = await requireAdminPermission('recommendation.edit');
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

export async function importMccIndustriesAction(db: DB, input: unknown): Promise<{ ok: true; added: number; skipped: number } | { ok: false; error: string }> {
  const session = await requireAdminPermission('recommendation.edit');
  const parsed = z.array(z.string().regex(/^\d{4}$/)).min(1).max(100).safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };
  const codes = [...new Set(parsed.data)];
  const rows = codes.map(code => MCC_INDUSTRIES.find(item => item.code === code));
  if (rows.some(row => !row)) return { ok: false, error: 'INVALID_INPUT' };
  const result = await db.transaction(async (tx: DB) => {
    const inserted = await tx.insert(pgRecommendationGroups).values(rows.map(row => ({
      id: randomUUID(), name: row!.name, mccCode: row!.code, mccVersion: MCC_VERSION,
      sortOrder: MCC_INDUSTRIES.findIndex(item => item.code === row!.code),
    }))).onConflictDoNothing().returning({ id: pgRecommendationGroups.id, code: pgRecommendationGroups.mccCode });
    if (inserted.length) await tx.insert(adminAuditLogs).values(inserted.map((row: { id: string; code: string }) => ({
      actor: session.adminId, action: 'pg_recommendation.mcc_import', entityType: 'pg_recommendation_group', entityId: row.id,
      payloadJson: { after: { mccCode: row.code, mccVersion: MCC_VERSION } },
    })));
    return { ok: true as const, added: inserted.length, skipped: codes.length - inserted.length };
  });
  revalidatePath('/pg-recommendations');
  return result;
}
