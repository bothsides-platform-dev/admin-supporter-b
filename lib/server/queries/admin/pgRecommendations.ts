import { asc, eq } from 'drizzle-orm';
import { pgRecommendationGroups, pgRecommendationMembers, workspaces } from '@/lib/db/schema';
import { actionDb } from '@/lib/server/actions/auth/_shared';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = any;

export type PgRecommendationGroupRow = {
  id: string;
  name: string;
  sortOrder: number;
  pgWorkspaceIds: string[];
};

export async function listPgRecommendationGroups(
  db: DB = actionDb(),
): Promise<PgRecommendationGroupRow[]> {
  const groups = await db.select({
    id: pgRecommendationGroups.id,
    name: pgRecommendationGroups.name,
    sortOrder: pgRecommendationGroups.sortOrder,
  }).from(pgRecommendationGroups)
    .orderBy(asc(pgRecommendationGroups.sortOrder), asc(pgRecommendationGroups.name));

  const members = await db.select({
    groupId: pgRecommendationMembers.groupId,
    pgWsId: pgRecommendationMembers.pgWsId,
  }).from(pgRecommendationMembers)
    .innerJoin(workspaces, eq(pgRecommendationMembers.pgWsId, workspaces.id))
    .orderBy(asc(workspaces.name), asc(pgRecommendationMembers.pgWsId));

  const idsByGroup = new Map<string, string[]>();
  for (const member of members as { groupId: string; pgWsId: string }[]) {
    const ids = idsByGroup.get(member.groupId) ?? [];
    ids.push(member.pgWsId);
    idsByGroup.set(member.groupId, ids);
  }

  return (groups as { id: string; name: string; sortOrder: number }[]).map((group) => ({
    ...group,
    pgWorkspaceIds: idsByGroup.get(group.id) ?? [],
  }));
}
