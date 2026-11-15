import { and, eq, gte, inArray, isNotNull, ne, sql } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { requireAdminPermission } from '@/lib/auth/admin-session';
import {
  auditLogs,
  bids,
  chatMessages,
  contracts,
  rfpInvitations,
  rfps,
  users,
  verificationApplications,
  workspaceMembers,
  workspaces,
} from '@/lib/db/schema';
import { computeOverview, type ActivityRow, type MetricsOverview } from '@/lib/metrics/compute';
import { DAY_MS, DEFAULT_WEEKS, kstDayStart, weekBuckets } from '@/lib/metrics/periods';
import { HUMAN_ACTIONS, excludedEmailDomains } from '@/lib/metrics/rules';
import { actionDb } from '@/lib/server/actions/auth/_shared';

type DB = ReturnType<typeof actionDb>;

export type MetricsOptions = {
  weeks?: number;
  /** 테스트 주입용. 기본은 현재 시각. */
  now?: Date;
  /** 테스트 주입용. 기본은 METRICS_EXCLUDED_EMAIL_DOMAINS. */
  excludedDomains?: readonly string[];
};

/** timestamptz 컬럼의 KST 날짜 키. DB 세션 타임존에 의존하지 않는다. */
const kstDay = (column: AnyPgColumn) =>
  sql<string>`to_char(${column} AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD')`;

/**
 * 핵심 지표 화면의 데이터. 정의는 lib/metrics/compute.ts 와 docs/METRICS.md 에 있다.
 *
 * 읽기 전용이다. 워크스페이스·멤버·요청·초대·견적·선정은 필요한 컬럼만 전체를 읽어
 * 메모리에서 집계한다 — 정의를 한 곳(compute.ts)에 두기 위한 선택이며, 요청이 수만 건을
 * 넘기면 SQL 집계로 옮긴다. 행이 빠르게 느는 감사 로그·메시지는 기간을 잘라
 * (유저, 워크스페이스, 날짜) 단위로만 읽는다.
 */
export async function getMetricsOverview(
  options: MetricsOptions = {},
  db: DB = actionDb(),
): Promise<MetricsOverview> {
  await requireAdminPermission('data.view');

  const now = options.now ?? new Date();
  const weeks = options.weeks ?? DEFAULT_WEEKS;
  const windowStart = weekBuckets(now, weeks)[0].start;
  // 주간 표와 최근 30일 활성 수를 모두 덮는 범위.
  const activityFrom = new Date(
    Math.min(windowStart.getTime(), kstDayStart(now).getTime() - 30 * DAY_MS),
  );

  const [
    workspaceRows,
    memberRows,
    approvalRows,
    requestRows,
    invitationRows,
    bidRows,
    awardRows,
    auditDays,
    chatDays,
  ] = await Promise.all([
    db
      .select({
        id: workspaces.id,
        type: workspaces.type,
        name: workspaces.name,
        createdAt: workspaces.createdAt,
        canonicalPgKey: workspaces.canonicalPgKey,
      })
      .from(workspaces),
    db
      .select({
        workspaceId: workspaceMembers.workspaceId,
        userId: workspaceMembers.userId,
        joinedAt: workspaceMembers.joinedAt,
        approvalStatus: workspaceMembers.approvalStatus,
        email: users.email,
        emailVerified: users.emailVerified,
        emailVerifiedAt: users.emailVerifiedAt,
        isSystemAccount: users.isSystemAccount,
        signupSource: users.signupSource,
      })
      .from(workspaceMembers)
      .innerJoin(users, eq(users.id, workspaceMembers.userId)),
    db
      .select({
        workspaceId: verificationApplications.workspaceId,
        reviewedAt: verificationApplications.reviewedAt,
      })
      .from(verificationApplications)
      .where(eq(verificationApplications.status, 'approved')),
    db
      .select({
        id: rfps.id,
        buyerWsId: rfps.buyerWsId,
        status: rfps.status,
        deadline: rfps.deadline,
        sentAt: rfps.sentAt,
      })
      .from(rfps)
      .where(ne(rfps.status, 'draft')),
    db
      .select({
        rfpId: rfpInvitations.rfpId,
        pgWsId: rfpInvitations.pgWsId,
        sentAt: rfpInvitations.sentAt,
        openedAt: rfpInvitations.openedAt,
      })
      .from(rfpInvitations),
    db
      .select({ rfpId: bids.rfpId, pgWsId: bids.pgWsId, submittedAt: bids.submittedAt })
      .from(bids)
      .where(ne(bids.status, 'draft')),
    db
      .select({ rfpId: contracts.rfpId, pgWsId: bids.pgWsId, awardedAt: contracts.awardedAt })
      .from(contracts)
      .innerJoin(bids, eq(bids.id, contracts.bidId)),
    db
      .selectDistinct({
        userId: auditLogs.actorUserId,
        workspaceId: auditLogs.actorWorkspaceId,
        day: kstDay(auditLogs.createdAt),
      })
      .from(auditLogs)
      .where(
        and(
          gte(auditLogs.createdAt, activityFrom),
          inArray(auditLogs.action, [...HUMAN_ACTIONS]),
          isNotNull(auditLogs.actorWorkspaceId),
        ),
      ),
    db
      .selectDistinct({
        userId: chatMessages.authorUserId,
        workspaceId: chatMessages.authorWsId,
        day: kstDay(chatMessages.createdAt),
      })
      .from(chatMessages)
      .where(gte(chatMessages.createdAt, activityFrom)),
  ]);

  const activity: ActivityRow[] = [...auditDays, ...chatDays].flatMap((row) =>
    row.workspaceId ? [{ userId: row.userId, workspaceId: row.workspaceId, day: row.day }] : [],
  );

  return computeOverview(
    {
      workspaces: workspaceRows,
      members: memberRows,
      approvals: approvalRows,
      requests: requestRows,
      invitations: invitationRows,
      bids: bidRows,
      awards: awardRows,
      activity,
    },
    { now, weeks, excludedDomains: options.excludedDomains ?? excludedEmailDomains() },
  );
}
