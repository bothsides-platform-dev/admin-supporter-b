import { and, asc, eq, gt, gte, ilike, inArray, lt, ne, notExists, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { actionDb } from '@/lib/server/actions/auth/_shared';
import { verificationApplications, workspaces } from '@/lib/db/schema';
import { dateBounds } from '@/lib/admin-list';

type DB = ReturnType<typeof actionDb>;

/**
 * Find the oldest actionable, latest application per workspace in the current
 * review filter. A historical submitted row must never lead to a dead end.
 */
export async function getNextReviewApplicationId(
  handledApplicationId: string,
  returnTo = '/review',
  db: DB = actionDb(),
  options: { skip?: boolean } = {},
): Promise<string | null> {
  const params = returnTo === '/review' || returnTo.startsWith('/review?')
    ? new URL(returnTo, 'http://admin.local').searchParams
    : new URLSearchParams();
  const status = params.get('status');
  if (status === 'approved' || status === 'rejected') return null;
  const actionableStatus = status && ['submitted', 'review_pending', 'needs_more_info'].includes(status) ? status : null;
  const statuses = actionableStatus
    ? [actionableStatus as 'submitted' | 'review_pending' | 'needs_more_info']
    : ['submitted', 'review_pending'] as const;
  const type = params.get('type');
  const q = params.get('q')?.trim();
  const { fromDate, toDate } = dateBounds(params.get('from') ?? undefined, params.get('to') ?? undefined);
  // 건너뛰기: 처리하지 않은 건이 큐에 그대로 남으므로, 가장 오래된 건이 아니라
  // 지금 건 "뒤"의 건을 골라야 두 건 사이를 오가지 않는다. 끝에 닿으면 null.
  let afterCurrent;
  if (options.skip) {
    const [current] = await db.select({ submittedAt: verificationApplications.submittedAt })
      .from(verificationApplications).where(eq(verificationApplications.id, handledApplicationId)).limit(1);
    if (current) {
      afterCurrent = or(
        gt(verificationApplications.submittedAt, current.submittedAt),
        and(eq(verificationApplications.submittedAt, current.submittedAt), gt(verificationApplications.id, handledApplicationId)),
      );
    }
  }
  const newer = alias(verificationApplications, 'newer_review_application');
  const hasNewerApplication = db.select({ one: sql<number>`1` }).from(newer).where(and(
    eq(newer.workspaceId, verificationApplications.workspaceId),
    or(
      gt(newer.submittedAt, verificationApplications.submittedAt),
      and(eq(newer.submittedAt, verificationApplications.submittedAt), gt(newer.id, verificationApplications.id)),
    ),
  ));
  const [next] = await db.select({ id: verificationApplications.id })
    .from(verificationApplications)
    .innerJoin(workspaces, eq(verificationApplications.workspaceId, workspaces.id))
    .where(and(
      ne(verificationApplications.id, handledApplicationId),
      inArray(verificationApplications.status, statuses),
      notExists(hasNewerApplication),
      afterCurrent,
      type === 'buyer' || type === 'pg' ? eq(verificationApplications.orgType, type) : undefined,
      q ? ilike(workspaces.name, `%${q}%`) : undefined,
      fromDate ? gte(verificationApplications.submittedAt, fromDate) : undefined,
      toDate ? lt(verificationApplications.submittedAt, toDate) : undefined,
    ))
    .orderBy(asc(verificationApplications.submittedAt), asc(verificationApplications.id))
    .limit(1);
  return next?.id ?? null;
}
