'use server';

import { eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireAdminSession } from '@/lib/auth/admin-session';
import { pgMatchingPolicies, pgRecommendationGroups, workspaces, adminAuditLogs } from '@/lib/db/schema';
import { matchingPolicySchema } from '@/lib/pg-matching-policy';

const Input = z.object({ groupId: z.string().uuid(), policy: matchingPolicySchema }).strict();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = any;

export async function savePgMatchingPolicyAction(db: DB, input: z.input<typeof Input>): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await requireAdminSession();
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };
  const { groupId, policy } = parsed.data;
  const result = await db.transaction(async (tx: DB) => {
    const [group] = await tx.select({ id: pgRecommendationGroups.id }).from(pgRecommendationGroups).where(eq(pgRecommendationGroups.id, groupId)).for('update');
    if (!group) return { ok: false as const, error: 'GROUP_NOT_FOUND' };
    const ids = policy.candidates.map(c => c.pgWorkspaceId);
    const pgs = ids.length ? await tx.select({ id: workspaces.id, type: workspaces.type }).from(workspaces).where(inArray(workspaces.id, ids)) : [];
    if (pgs.length !== ids.length || pgs.some((p: { type: string }) => p.type !== 'pg')) return { ok: false as const, error: 'PG_WORKSPACE_REQUIRED' };
    const [before] = await tx.select({ policy: pgMatchingPolicies.policy }).from(pgMatchingPolicies).where(eq(pgMatchingPolicies.groupId, groupId));
    await tx.insert(pgMatchingPolicies).values({ groupId, policy }).onConflictDoUpdate({ target: pgMatchingPolicies.groupId, set: { policy, updatedAt: new Date() } });
    await tx.insert(adminAuditLogs).values({ actor: session.adminId, action: 'pg_matching.policy_save', entityType: 'pg_recommendation_group', entityId: groupId, payloadJson: { before: before?.policy ?? {}, after: policy } });
    return { ok: true as const };
  });
  if (result.ok) revalidatePath('/pg-recommendations');
  return result;
}
