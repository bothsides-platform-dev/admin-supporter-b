import { and, desc, eq } from 'drizzle-orm';
import { workspaceMembers, users, workspaces } from '@/lib/db/schema';
import { actionDb } from '@/lib/server/actions/auth/_shared';

export type PgMemberRow = {
  userId: string;
  workspaceId: string;
  name: string;
  email: string;
  workspaceName: string;
  joinedAt: Date;
  approvalStatus: string;
};

/**
 * PG 워크스페이스 멤버 목록.
 *
 * status 인자:
 *   - 생략 또는 빈 문자열: pending_approval 만 반환 (기본 보기).
 *   - 'all': 전체.
 *   - 그 외 ('approved' | 'rejected'): 해당 값으로 필터.
 */
export async function listPgMembers({
  status,
}: {
  status?: string;
} = {}): Promise<PgMemberRow[]> {
  const db = actionDb();

  const VALID = new Set(['pending_approval', 'approved', 'rejected', 'all']);
  const safeStatus = status && VALID.has(status) ? status : undefined;
  const filterStatus = safeStatus === 'all' ? undefined : (safeStatus ?? 'pending_approval');

  const rows = await db
    .select({
      userId: workspaceMembers.userId,
      workspaceId: workspaceMembers.workspaceId,
      name: users.name,
      email: users.email,
      workspaceName: workspaces.name,
      joinedAt: workspaceMembers.joinedAt,
      approvalStatus: workspaceMembers.approvalStatus,
    })
    .from(workspaceMembers)
    .innerJoin(users, eq(workspaceMembers.userId, users.id))
    .innerJoin(workspaces, eq(workspaceMembers.workspaceId, workspaces.id))
    .where(
      and(
        eq(workspaces.type, 'pg'),
        filterStatus ? eq(workspaceMembers.approvalStatus, filterStatus) : undefined,
      ),
    )
    .orderBy(desc(workspaceMembers.joinedAt));

  return rows;
}
