// 지표 계산 — DB 와 무관한 순수 함수. 정의는 docs/METRICS.md 와 한 쌍이다.
//
// 조회 계층(lib/server/queries/admin/metrics.ts)이 좁은 컬럼으로 읽어 온 행을 받아
// 화면에 필요한 숫자를 만든다. 모든 정의가 이 파일 한 곳에 있어야 화면·문서·테스트가
// 같은 기준을 쓴다.
import { migrateSignupSource } from '@/lib/types/signup-source';
import { DAY_MS, bucketIndex, kstDateKey, kstDayStart, weekBuckets, type WeekBucket } from './periods';
import { isExcludedEmail, isTestWorkspaceName } from './rules';

export type WorkspaceType = 'buyer' | 'pg';

export type WorkspaceRow = {
  id: string;
  type: WorkspaceType;
  name: string;
  createdAt: Date;
  /** 미리 등록해 둔 PG사 워크스페이스 표식. 사용자가 만든 워크스페이스는 null. */
  canonicalPgKey: string | null;
};

export type MemberRow = {
  workspaceId: string;
  userId: string;
  joinedAt: Date;
  approvalStatus: string;
  email: string;
  emailVerified: boolean;
  emailVerifiedAt: Date | null;
  isSystemAccount: boolean;
  signupSource: unknown;
};

/** 승인된 입점 신청만 넘긴다. */
export type ApprovalRow = { workspaceId: string; reviewedAt: Date | null };

/** 초안이 아닌 요청(RFP)만 넘긴다. */
export type RequestRow = {
  id: string;
  buyerWsId: string;
  status: string;
  deadline: Date;
  sentAt: Date | null;
};

export type InvitationRow = { rfpId: string; pgWsId: string; sentAt: Date; openedAt: Date | null };

/** 초안이 아닌 견적(제출 + 철회)만 넘긴다. 재견적 회차는 행이 여러 개다. */
export type BidRow = { rfpId: string; pgWsId: string; submittedAt: Date };

export type AwardRow = { rfpId: string; pgWsId: string; awardedAt: Date };

/** 사람이 한 행동이 있었던 (유저, 워크스페이스, KST 날짜). */
export type ActivityRow = { userId: string; workspaceId: string; day: string };

export type MetricsInput = {
  workspaces: WorkspaceRow[];
  members: MemberRow[];
  approvals: ApprovalRow[];
  requests: RequestRow[];
  invitations: InvitationRow[];
  bids: BidRow[];
  awards: AwardRow[];
  activity: ActivityRow[];
};

export type Ratio = { num: number; den: number };

export type WeeklyRow = {
  bucket: WeekBucket;
  newBuyers: number;
  newPgs: number;
  buyerApprovals: number;
  requestsSent: number;
  /** 그 주에 첫 견적을 받은 요청 수 (North Star 후보). */
  requestsQuoted: number;
  awards: number;
  activeBuyers: number;
  activePgs: number;
};

export type FunnelStepKey = 'created' | 'verified' | 'approved' | 'requested' | 'quoted' | 'awarded';

export type FunnelStep = {
  key: FunnelStepKey;
  count: number;
  /** 직전 단계에서 이 단계까지 걸린 시간의 중앙값. 계산할 수 없으면 null. */
  medianFromPrevMs: number | null;
};

export type Liquidity = {
  /** 기간 내 발송된 요청 중 종결된 것 (마감 경과 또는 선정·취소·마감 처리). */
  concluded: number;
  /** 기간 내 발송된 요청 중 아직 진행 중인 것. 비율의 분모에 넣지 않는다. */
  open: number;
  quoted: Ratio;
  awarded: Ratio;
  inviteOpened: Ratio;
  pgResponded: Ratio;
  /** 종결됐는데 견적을 한 건도 받지 못한 요청. */
  unanswered: number;
  medianFirstQuoteMs: number | null;
  medianAwardMs: number | null;
};

export type PgRow = {
  id: string;
  name: string;
  /** 시스템 계정이 아닌 승인 담당자가 있는가. 없으면 요청을 받아도 응답할 사람이 없다. */
  staffed: boolean;
  invited: number;
  opened: number;
  /** 견적을 낸 요청 수 (회차 중복 제거). */
  quoted: number;
  won: number;
  /** 조회한 범위 안에서 마지막으로 활동한 KST 날짜. 없으면 null. */
  lastActiveDay: string | null;
};

export type ActiveCounts = { users: number; buyers: number; pgs: number };

export type SourceRow = { label: string; created: number; approved: number; requested: number };

export type MetricsOverview = {
  generatedAt: Date;
  weeks: number;
  weekly: WeeklyRow[];
  funnel: FunnelStep[];
  liquidity: Liquidity;
  pgs: PgRow[];
  active: { day: ActiveCounts; week: ActiveCounts; month: ActiveCounts };
  sources: SourceRow[];
  exclusions: {
    /** 시스템 계정 + 내부 도메인 계정. */
    users: number;
    /** 테스트 이름 또는 내부 직원만 있는 워크스페이스. */
    workspaces: number;
    /** 실제 담당자가 아직 합류하지 않은 PG 워크스페이스. 신규·활성 수에만 넣지 않는다. */
    registeredOnlyPgs: number;
    /** 테스트·내부 구매사의 것이라 뺀 요청 (초안 제외). */
    requests: number;
    /** 발송 시각도 초대도 없어 시점을 알 수 없어 뺀 요청. */
    requestsWithoutSentAt: number;
    /** sent_at 이 비어 첫 초대 시각으로 대신한 요청. 집계에는 포함된다. */
    sentAtFallbacks: number;
    domains: string[];
  };
};

export const FUNNEL_STEPS: readonly FunnelStepKey[] = [
  'created', 'verified', 'approved', 'requested', 'quoted', 'awarded',
];

/** 유입 경로를 알 수 없을 때의 표시. */
export const UNKNOWN_SOURCE = '직접·알 수 없음';

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function earliest(dates: readonly (Date | null | undefined)[]): Date | null {
  let found: Date | null = null;
  for (const date of dates) {
    if (date && (!found || date.getTime() < found.getTime())) found = date;
  }
  return found;
}

function groupBy<T>(rows: readonly T[], key: (row: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const id = key(row);
    const group = groups.get(id);
    if (group) group.push(row);
    else groups.set(id, [row]);
  }
  return groups;
}

/** 가입 유입 경로 표시: UTM → 외부 referrer 도메인 → 알 수 없음. */
export function sourceLabel(raw: unknown): string {
  const source = migrateSignupSource(raw);
  if (source.utmSource) {
    return source.utmMedium ? `${source.utmSource} / ${source.utmMedium}` : source.utmSource;
  }
  if (source.referrer) {
    try {
      return new URL(source.referrer).hostname.replace(/^www\./, '');
    } catch {
      return UNKNOWN_SOURCE;
    }
  }
  return UNKNOWN_SOURCE;
}

type WorkspaceFacts = {
  row: WorkspaceRow;
  /** 테스트 이름이거나 내부 직원만 있다. 어떤 집계에도 넣지 않는다. */
  excluded: boolean;
  /** 시스템 계정이 아닌 승인 담당자가 있는가. 구매사는 항상 true. */
  staffed: boolean;
  /** 집계상 시작 시각. 등록 PG 는 첫 실제 담당자가 합류한 시각. */
  startedAt: Date;
  /** 워크스페이스를 만든 사람 (시스템 계정이 아닌 가장 이른 멤버). */
  creator: MemberRow | null;
  verified: boolean;
  verifiedAt: Date | null;
};

type RequestFacts = {
  id: string;
  buyerWsId: string;
  sentAt: Date;
  concluded: boolean;
  firstQuoteAt: Date | null;
  awardedAt: Date | null;
  awardedPgId: string | null;
  quotedPgIds: Set<string>;
  invitations: InvitationRow[];
};

function elapsed(from: Date | null, to: Date | null): number | null {
  if (!from || !to) return null;
  return Math.max(0, to.getTime() - from.getTime());
}

export function computeOverview(
  input: MetricsInput,
  options: { now: Date; weeks: number; excludedDomains?: readonly string[] },
): MetricsOverview {
  const { now, weeks } = options;
  const domains = [...(options.excludedDomains ?? [])];
  const buckets = weekBuckets(now, weeks);
  const windowStart = buckets[0].start.getTime();
  const nowMs = now.getTime();

  // ── 워크스페이스·유저 분류 ──────────────────────────────────────────
  const membersByWorkspace = groupBy(input.members, (member) => member.workspaceId);
  const excludedUserIds = new Set<string>();
  for (const member of input.members) {
    if (member.isSystemAccount || isExcludedEmail(member.email, domains)) excludedUserIds.add(member.userId);
  }

  const facts = new Map<string, WorkspaceFacts>();
  let excludedWorkspaces = 0;
  let registeredOnlyPgs = 0;
  for (const row of input.workspaces) {
    const realMembers = (membersByWorkspace.get(row.id) ?? []).filter((member) => !member.isSystemAccount);
    const internalOnly = realMembers.length > 0
      && realMembers.every((member) => isExcludedEmail(member.email, domains));
    const excluded = isTestWorkspaceName(row.name) || internalOnly;
    const approvedMembers = realMembers.filter((member) => member.approvalStatus === 'approved');
    // 미리 등록만 해 둔 PG 는 담당자가 합류하기 전까지 공급(신규·활성)으로 세지 않는다.
    // 그래도 요청을 받고 견적이 나갈 수 있으므로 요청 결과에서는 빼지 않는다.
    const staffed = row.type === 'buyer' || approvedMembers.length > 0;
    if (excluded) excludedWorkspaces += 1;
    else if (!staffed) registeredOnlyPgs += 1;

    const verifiedMembers = realMembers.filter((member) => member.emailVerified);
    const firstJoin = earliest(approvedMembers.map((member) => member.joinedAt));
    const creator = realMembers.reduce<MemberRow | null>(
      (first, member) => (!first || member.joinedAt.getTime() < first.joinedAt.getTime() ? member : first),
      null,
    );
    facts.set(row.id, {
      row,
      excluded,
      staffed,
      startedAt: row.type === 'pg' && row.canonicalPgKey && firstJoin ? firstJoin : row.createdAt,
      creator,
      verified: verifiedMembers.length > 0,
      verifiedAt: earliest(verifiedMembers.map((member) => member.emailVerifiedAt)),
    });
  }
  /** 요청 결과에 넣을 워크스페이스인가 — 테스트·내부만 뺀다. */
  const inScope = (workspaceId: string, type: WorkspaceType) => {
    const workspace = facts.get(workspaceId);
    return !!workspace && !workspace.excluded && workspace.row.type === type;
  };
  /** 신규·활성 수에 넣을 워크스페이스인가 — 담당자가 없는 PG 도 뺀다. */
  const isCounted = (workspace: WorkspaceFacts) => !workspace.excluded && workspace.staffed;

  // ── 승인 시각 (워크스페이스의 가장 이른 승인) ────────────────────────
  const approvedAt = new Map<string, Date | null>();
  for (const [workspaceId, rows] of groupBy(input.approvals, (row) => row.workspaceId)) {
    approvedAt.set(workspaceId, earliest(rows.map((row) => row.reviewedAt)));
  }

  // ── 요청 단위 사실 ──────────────────────────────────────────────────
  const invitationsByRequest = groupBy(
    input.invitations.filter((row) => inScope(row.pgWsId, 'pg')),
    (row) => row.rfpId,
  );
  const bidsByRequest = groupBy(
    input.bids.filter((row) => inScope(row.pgWsId, 'pg')),
    (row) => row.rfpId,
  );
  const awardByRequest = new Map<string, AwardRow>();
  for (const award of input.awards) {
    if (inScope(award.pgWsId, 'pg')) awardByRequest.set(award.rfpId, award);
  }
  // 발송 시각 대체값에는 제외 전의 모든 초대를 쓴다 — 요청이 언제 나갔는지는
  // 받는 쪽이 테스트 PG 인지와 무관하다.
  const firstInvitationAt = new Map<string, Date>();
  for (const invitation of input.invitations) {
    const current = firstInvitationAt.get(invitation.rfpId);
    if (!current || invitation.sentAt.getTime() < current.getTime()) {
      firstInvitationAt.set(invitation.rfpId, invitation.sentAt);
    }
  }

  const requests: RequestFacts[] = [];
  let excludedRequests = 0;
  let requestsWithoutSentAt = 0;
  let sentAtFallbacks = 0;
  for (const row of input.requests) {
    if (!inScope(row.buyerWsId, 'buyer')) {
      excludedRequests += 1;
      continue;
    }
    // 초안을 나중에 발송한 경로는 sent_at 이 비어 있을 수 있어 첫 초대 시각으로 대체한다.
    const sentAt = row.sentAt ?? firstInvitationAt.get(row.id) ?? null;
    if (!sentAt) {
      requestsWithoutSentAt += 1;
      continue;
    }
    if (!row.sentAt) sentAtFallbacks += 1;
    const bids = bidsByRequest.get(row.id) ?? [];
    const award = awardByRequest.get(row.id) ?? null;
    requests.push({
      id: row.id,
      buyerWsId: row.buyerWsId,
      sentAt,
      concluded: row.status !== 'sent' || row.deadline.getTime() <= nowMs,
      firstQuoteAt: earliest(bids.map((bid) => bid.submittedAt)),
      awardedAt: award?.awardedAt ?? null,
      awardedPgId: award?.pgWsId ?? null,
      quotedPgIds: new Set(bids.map((bid) => bid.pgWsId)),
      invitations: invitationsByRequest.get(row.id) ?? [],
    });
  }
  const requestsByBuyer = groupBy(requests, (request) => request.buyerWsId);

  // ── 활동 (행동 기준) ────────────────────────────────────────────────
  const activity = input.activity.filter((row) => {
    const workspace = facts.get(row.workspaceId);
    return !!workspace && isCounted(workspace) && !excludedUserIds.has(row.userId);
  });
  const activeCounts = (fromKey: string, toKey: string): ActiveCounts => {
    const users = new Set<string>();
    const buyers = new Set<string>();
    const pgs = new Set<string>();
    for (const row of activity) {
      if (row.day < fromKey || row.day >= toKey) continue;
      users.add(row.userId);
      (facts.get(row.workspaceId)!.row.type === 'buyer' ? buyers : pgs).add(row.workspaceId);
    }
    return { users: users.size, buyers: buyers.size, pgs: pgs.size };
  };

  // ── 1. 주간 추이 (그 주에 일어난 사건 수) ────────────────────────────
  const weekly: WeeklyRow[] = buckets.map((bucket) => {
    const active = activeCounts(kstDateKey(bucket.start), kstDateKey(bucket.end));
    return {
      bucket,
      newBuyers: 0,
      newPgs: 0,
      buyerApprovals: 0,
      requestsSent: 0,
      requestsQuoted: 0,
      awards: 0,
      activeBuyers: active.buyers,
      activePgs: active.pgs,
    };
  });
  type EventField = 'newBuyers' | 'newPgs' | 'buyerApprovals' | 'requestsSent' | 'requestsQuoted' | 'awards';
  const bump = (at: Date | null, field: EventField) => {
    if (!at || at.getTime() >= nowMs) return;
    const index = bucketIndex(buckets, at);
    if (index >= 0) weekly[index][field] += 1;
  };
  for (const workspace of facts.values()) {
    if (!isCounted(workspace)) continue;
    bump(workspace.startedAt, workspace.row.type === 'buyer' ? 'newBuyers' : 'newPgs');
    if (workspace.row.type === 'buyer') bump(approvedAt.get(workspace.row.id) ?? null, 'buyerApprovals');
  }
  for (const request of requests) {
    bump(request.sentAt, 'requestsSent');
    bump(request.firstQuoteAt, 'requestsQuoted');
    bump(request.awardedAt, 'awards');
  }

  // ── 2. 구매사 퍼널 (기간 내 생성된 구매사 워크스페이스 코호트) ───────
  // 각 단계는 앞 단계를 모두 충족한 워크스페이스만 센다. 자동 승인은 이메일 인증보다
  // 먼저 일어날 수 있어 '승인' 단계는 인증과 승인을 모두 충족한 시점으로 본다.
  const reached: Record<FunnelStepKey, number> = { created: 0, verified: 0, approved: 0, requested: 0, quoted: 0, awarded: 0 };
  const durations: Record<FunnelStepKey, number[]> = { created: [], verified: [], approved: [], requested: [], quoted: [], awarded: [] };
  const sources = new Map<string, SourceRow>();
  for (const workspace of facts.values()) {
    const createdAt = workspace.row.createdAt;
    if (workspace.excluded || workspace.row.type !== 'buyer') continue;
    if (createdAt.getTime() < windowStart || createdAt.getTime() >= nowMs) continue;

    const own = requestsByBuyer.get(workspace.row.id) ?? [];
    // 조건별로 그 조건이 처음 충족된 시각. 알 수 없으면 null.
    const conditionAt: Record<FunnelStepKey, Date | null> = {
      created: createdAt,
      verified: workspace.verifiedAt,
      approved: approvedAt.get(workspace.row.id) ?? null,
      requested: earliest(own.map((request) => request.sentAt)),
      quoted: earliest(own.map((request) => request.firstQuoteAt)),
      awarded: earliest(own.map((request) => request.awardedAt)),
    };
    const passed: Record<FunnelStepKey, boolean> = {
      created: true,
      verified: workspace.verified,
      approved: approvedAt.has(workspace.row.id),
      requested: own.length > 0,
      quoted: own.some((request) => request.firstQuoteAt),
      awarded: own.some((request) => request.awardedAt),
    };

    // 단계 도달 시각 = 앞 단계 도달 시각과 이 단계 조건 시각 중 늦은 쪽.
    // 이미 인증된 사용자가 새 워크스페이스를 만든 경우처럼 조건이 먼저 충족돼 있으면
    // 소요 시간은 0 이 된다.
    let previousAt: Date | null = null;
    for (const step of FUNNEL_STEPS) {
      if (!passed[step]) break;
      reached[step] += 1;
      const metAt = conditionAt[step];
      const reachedAt: Date | null = metAt && previousAt
        ? new Date(Math.max(metAt.getTime(), previousAt.getTime()))
        : metAt;
      if (step !== 'created') {
        const took = elapsed(previousAt, reachedAt);
        if (took !== null) durations[step].push(took);
      }
      previousAt = reachedAt;
    }

    const label = sourceLabel(workspace.creator?.signupSource);
    const source = sources.get(label) ?? { label, created: 0, approved: 0, requested: 0 };
    source.created += 1;
    if (passed.verified && passed.approved) source.approved += 1;
    if (passed.verified && passed.approved && passed.requested) source.requested += 1;
    sources.set(label, source);
  }
  const funnel: FunnelStep[] = FUNNEL_STEPS.map((key) => ({
    key,
    count: reached[key],
    medianFromPrevMs: median(durations[key]),
  }));

  // ── 3. 유동성 (기간 내 발송된 요청) ─────────────────────────────────
  const inWindow = requests.filter(
    (request) => request.sentAt.getTime() >= windowStart && request.sentAt.getTime() < nowMs,
  );
  const concluded = inWindow.filter((request) => request.concluded);
  const concludedInvitations = concluded.flatMap((request) =>
    request.invitations.map((invitation) => ({ invitation, request })),
  );
  const quotedCount = concluded.filter((request) => request.firstQuoteAt).length;
  const liquidity: Liquidity = {
    concluded: concluded.length,
    open: inWindow.length - concluded.length,
    quoted: { num: quotedCount, den: concluded.length },
    awarded: { num: concluded.filter((request) => request.awardedAt).length, den: concluded.length },
    inviteOpened: {
      num: concludedInvitations.filter(({ invitation }) => invitation.openedAt).length,
      den: concludedInvitations.length,
    },
    pgResponded: {
      num: concludedInvitations.filter(({ invitation, request }) => request.quotedPgIds.has(invitation.pgWsId)).length,
      den: concludedInvitations.length,
    },
    unanswered: concluded.length - quotedCount,
    medianFirstQuoteMs: median(
      inWindow.flatMap((request) => elapsed(request.sentAt, request.firstQuoteAt) ?? []),
    ),
    medianAwardMs: median(
      inWindow.flatMap((request) => elapsed(request.sentAt, request.awardedAt) ?? []),
    ),
  };

  // ── 4. PG별 현황 (기간 내 발송된 요청 기준) ─────────────────────────
  const pgRows = new Map<string, PgRow>();
  for (const workspace of facts.values()) {
    if (workspace.excluded || workspace.row.type !== 'pg') continue;
    pgRows.set(workspace.row.id, {
      id: workspace.row.id, name: workspace.row.name, staffed: workspace.staffed,
      invited: 0, opened: 0, quoted: 0, won: 0, lastActiveDay: null,
    });
  }
  const touch = (pgId: string, day: string) => {
    const row = pgRows.get(pgId);
    if (row && (!row.lastActiveDay || day > row.lastActiveDay)) row.lastActiveDay = day;
  };
  for (const request of inWindow) {
    for (const invitation of request.invitations) {
      const row = pgRows.get(invitation.pgWsId);
      if (!row) continue;
      row.invited += 1;
      if (invitation.openedAt) row.opened += 1;
    }
    for (const pgId of request.quotedPgIds) {
      const row = pgRows.get(pgId);
      if (row) row.quoted += 1;
    }
    if (request.awardedPgId) {
      const row = pgRows.get(request.awardedPgId);
      if (row) row.won += 1;
    }
  }
  for (const bid of input.bids) touch(bid.pgWsId, kstDateKey(bid.submittedAt));
  for (const row of activity) touch(row.workspaceId, row.day);
  // 담당자가 없는 PG 는 기간 내에 요청을 받았거나 견적·선정이 있을 때만 보여준다 —
  // 응답할 사람이 없는 곳으로 요청이 가고 있다는 사실은 운영자가 알아야 한다.
  const pgs = [...pgRows.values()]
    .filter((row) => row.staffed || row.invited > 0 || row.quoted > 0 || row.won > 0)
    .sort((a, b) => b.invited - a.invited || b.quoted - a.quoted || a.name.localeCompare(b.name, 'ko'));

  // ── 5. 활성 사용자 (행동 기준, 오늘을 뺀 완결된 날짜) ────────────────
  const today = kstDayStart(now);
  const todayKey = kstDateKey(today);
  const daysAgo = (days: number) => kstDateKey(new Date(today.getTime() - days * DAY_MS));

  return {
    generatedAt: now,
    weeks,
    weekly,
    funnel,
    liquidity,
    pgs,
    active: {
      day: activeCounts(daysAgo(1), todayKey),
      week: activeCounts(daysAgo(7), todayKey),
      month: activeCounts(daysAgo(30), todayKey),
    },
    sources: [...sources.values()].sort(
      (a, b) => b.created - a.created || a.label.localeCompare(b.label, 'ko'),
    ),
    exclusions: {
      users: excludedUserIds.size,
      workspaces: excludedWorkspaces,
      registeredOnlyPgs,
      requests: excludedRequests,
      requestsWithoutSentAt,
      sentAtFallbacks,
      domains,
    },
  };
}
