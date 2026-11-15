import { describe, expect, it } from 'vitest';
import {
  UNKNOWN_SOURCE,
  computeOverview,
  median,
  sourceLabel,
  type MemberRow,
  type MetricsInput,
  type WorkspaceRow,
} from '../compute';

const at = (iso: string) => new Date(iso);
const HOUR = 3_600_000;

// 2026-11-15(일) 12:00 KST. 4주 창: 10/19~10/25, 10/26~11/1, 11/2~11/8, 11/9~11/15
const NOW = at('2026-11-15T03:00:00Z');

function workspace(id: string, type: 'buyer' | 'pg', name: string, createdAt: string, canonicalPgKey: string | null = null): WorkspaceRow {
  return { id, type, name, createdAt: at(createdAt), canonicalPgKey };
}

function member(workspaceId: string, userId: string, overrides: Partial<MemberRow> = {}): MemberRow {
  return {
    workspaceId,
    userId,
    joinedAt: at('2026-09-01T00:00:00Z'),
    approvalStatus: 'approved',
    email: `${userId}@customer.example`,
    emailVerified: true,
    emailVerifiedAt: at('2026-09-01T00:00:00Z'),
    isSystemAccount: false,
    signupSource: {},
    ...overrides,
  };
}

function fixture(): MetricsInput {
  return {
    workspaces: [
      workspace('B0', 'buyer', '오래된 구매사', '2026-09-01T00:00:00Z'),
      workspace('B1', 'buyer', '알파상사', '2026-10-20T01:00:00Z'),
      workspace('B2', 'buyer', '베타몰', '2026-11-03T01:00:00Z'),
      workspace('B3', 'buyer', '테스트 구매사', '2026-11-03T01:00:00Z'),
      workspace('B4', 'buyer', '감마', '2026-11-10T01:00:00Z'),
      workspace('P1', 'pg', 'PG 원', '2026-09-01T00:00:00Z'),
      workspace('P2', 'pg', 'PG 투', '2026-01-01T00:00:00Z', 'pg-two'),
      workspace('P3', 'pg', '등록만 PG', '2026-01-01T00:00:00Z', 'pg-three'),
      workspace('P4', 'pg', 'Test PG', '2026-09-01T00:00:00Z'),
    ],
    members: [
      member('B0', 'u0'),
      member('B1', 'u1', {
        joinedAt: at('2026-10-20T01:00:00Z'),
        emailVerifiedAt: at('2026-10-20T02:00:00Z'),
        signupSource: { _v: 1, utmSource: 'google', utmMedium: 'cpc' },
      }),
      member('B2', 'u2', {
        joinedAt: at('2026-11-03T01:00:00Z'),
        emailVerifiedAt: at('2026-11-03T03:00:00Z'),
        signupSource: { _v: 1, referrer: 'https://www.naver.com/search?q=pg' },
      }),
      member('B3', 'u3', { joinedAt: at('2026-11-03T01:00:00Z') }),
      member('B4', 'u4', { joinedAt: at('2026-11-10T01:00:00Z'), emailVerified: false, emailVerifiedAt: null }),
      member('P1', 'p1'),
      member('P2', 'sys2', { joinedAt: at('2026-01-01T00:00:00Z'), isSystemAccount: true }),
      member('P2', 'p2', { joinedAt: at('2026-11-04T00:00:00Z') }),
      member('P3', 'sys3', { joinedAt: at('2026-01-01T00:00:00Z'), isSystemAccount: true }),
      member('P4', 'p4'),
    ],
    approvals: [
      { workspaceId: 'B0', reviewedAt: at('2026-09-02T00:00:00Z') },
      { workspaceId: 'B1', reviewedAt: at('2026-10-21T01:00:00Z') },
      // 자동 승인: 이메일 인증(03:00)보다 먼저(02:00) 승인됐다.
      { workspaceId: 'B2', reviewedAt: at('2026-11-03T02:00:00Z') },
      { workspaceId: 'B3', reviewedAt: at('2026-11-03T02:00:00Z') },
      // 자동 승인됐지만 아직 이메일 인증을 하지 않았다.
      { workspaceId: 'B4', reviewedAt: at('2026-11-10T01:00:00Z') },
    ],
    requests: [
      { id: 'R1', buyerWsId: 'B1', status: 'awarded', deadline: at('2026-10-29T09:00:00Z'), sentAt: at('2026-10-22T01:00:00Z') },
      // sent_at 이 비어 있는 요청: 첫 초대 시각으로 대체한다. 마감이 지나 종결됐다.
      { id: 'R2', buyerWsId: 'B1', status: 'sent', deadline: at('2026-11-08T09:00:00Z'), sentAt: null },
      // 마감 전이라 진행 중이다.
      { id: 'R3', buyerWsId: 'B2', status: 'sent', deadline: at('2026-11-20T09:00:00Z'), sentAt: at('2026-11-12T01:00:00Z') },
      { id: 'R4', buyerWsId: 'B3', status: 'sent', deadline: at('2026-11-20T09:00:00Z'), sentAt: at('2026-11-12T01:00:00Z') },
      // 기간 시작 전에 발송됐다.
      { id: 'R5', buyerWsId: 'B0', status: 'cancelled', deadline: at('2026-10-15T09:00:00Z'), sentAt: at('2026-10-10T01:00:00Z') },
    ],
    invitations: [
      { rfpId: 'R1', pgWsId: 'P1', sentAt: at('2026-10-22T01:00:00Z'), openedAt: at('2026-10-22T03:00:00Z') },
      { rfpId: 'R1', pgWsId: 'P4', sentAt: at('2026-10-22T01:00:00Z'), openedAt: at('2026-10-22T01:30:00Z') },
      { rfpId: 'R2', pgWsId: 'P2', sentAt: at('2026-11-05T01:00:00Z'), openedAt: null },
      { rfpId: 'R3', pgWsId: 'P1', sentAt: at('2026-11-12T01:00:00Z'), openedAt: at('2026-11-12T02:00:00Z') },
      { rfpId: 'R4', pgWsId: 'P1', sentAt: at('2026-11-12T01:00:00Z'), openedAt: null },
    ],
    bids: [
      // 테스트 PG 의 견적은 세지 않는다 — 첫 견적 시각도 당기지 않는다.
      { rfpId: 'R1', pgWsId: 'P4', submittedAt: at('2026-10-22T02:00:00Z') },
      { rfpId: 'R1', pgWsId: 'P1', submittedAt: at('2026-10-23T01:00:00Z') },
      // 재견적 2회차: 같은 요청·같은 PG 는 한 번만 센다.
      { rfpId: 'R1', pgWsId: 'P1', submittedAt: at('2026-10-25T01:00:00Z') },
      { rfpId: 'R3', pgWsId: 'P1', submittedAt: at('2026-11-13T01:00:00Z') },
    ],
    awards: [{ rfpId: 'R1', pgWsId: 'P1', awardedAt: at('2026-10-27T01:00:00Z') }],
    activity: [
      { userId: 'u1', workspaceId: 'B1', day: '2026-10-22' },
      { userId: 'u1', workspaceId: 'B1', day: '2026-11-14' },
      { userId: 'p1', workspaceId: 'P1', day: '2026-11-13' },
      { userId: 'p2', workspaceId: 'P2', day: '2026-11-10' },
      { userId: 'u3', workspaceId: 'B3', day: '2026-11-14' }, // 테스트 워크스페이스
      { userId: 'sys2', workspaceId: 'P2', day: '2026-11-14' }, // 시스템 계정
      { userId: 'u1', workspaceId: 'B1', day: '2026-11-15' }, // 오늘은 아직 끝나지 않았다
    ],
  };
}

const overview = () => computeOverview(fixture(), { now: NOW, weeks: 4 });

describe('주간 추이', () => {
  it('그 주에 일어난 사건을 KST 주 단위 원시 건수로 센다', () => {
    const weekly = overview().weekly;
    const column = (field: keyof (typeof weekly)[number]) => weekly.map((row) => row[field]);

    expect(weekly.map((row) => row.bucket.label)).toEqual(['10/19~10/25', '10/26~11/1', '11/2~11/8', '11/9~11/15']);
    expect(column('newBuyers')).toEqual([1, 0, 1, 1]);
    expect(column('buyerApprovals')).toEqual([1, 0, 1, 1]);
    expect(column('requestsSent')).toEqual([1, 0, 1, 1]);
    expect(column('requestsQuoted')).toEqual([1, 0, 0, 1]);
    expect(column('awards')).toEqual([0, 1, 0, 0]);
    expect(column('activeBuyers')).toEqual([1, 0, 0, 1]);
    expect(column('activePgs')).toEqual([0, 0, 0, 2]);
  });

  it('미리 등록된 PG 는 실제 담당자가 합류한 주에 신규로 센다', () => {
    // P2 워크스페이스는 1월에 만들어졌지만 실제 담당자는 11/4 에 합류했다.
    expect(overview().weekly.map((row) => row.newPgs)).toEqual([0, 0, 1, 0]);
  });
});

describe('구매사 퍼널 (워크스페이스 코호트)', () => {
  it('앞 단계를 모두 충족한 워크스페이스만 세어 뒤로 갈수록 줄어든다', () => {
    const funnel = overview().funnel;

    expect(funnel.map((step) => [step.key, step.count])).toEqual([
      ['created', 3], ['verified', 2], ['approved', 2], ['requested', 2], ['quoted', 2], ['awarded', 1],
    ]);
    for (let i = 1; i < funnel.length; i++) expect(funnel[i].count).toBeLessThanOrEqual(funnel[i - 1].count);
  });

  it('자동 승인됐어도 이메일 인증 전이면 승인 단계에 넣지 않는다', () => {
    const funnel = overview().funnel;
    // B4 는 승인됐지만 미인증이라 created 에만 포함된다.
    expect(funnel.find((step) => step.key === 'created')?.count).toBe(3);
    expect(funnel.find((step) => step.key === 'approved')?.count).toBe(2);
  });

  it('단계 간 소요 시간은 중앙값이며, 조건이 먼저 충족돼 있으면 0 으로 센다', () => {
    const took = Object.fromEntries(overview().funnel.map((step) => [step.key, step.medianFromPrevMs]));

    expect(took.created).toBeNull();
    expect(took.verified).toBe(1.5 * HOUR); // B1 1시간, B2 2시간
    expect(took.approved).toBe(11.5 * HOUR); // B1 23시간, B2 는 승인이 인증보다 빨라 0
    expect(took.requested).toBe(119 * HOUR); // B1 24시간, B2 214시간
    expect(took.quoted).toBe(24 * HOUR);
    expect(took.awarded).toBe(96 * HOUR);
  });

  it('기간 전에 만들어진 워크스페이스와 제외 대상은 코호트에 넣지 않는다', () => {
    // B0(기간 전), B3(테스트 이름) 제외 → B1·B2·B4
    expect(overview().funnel[0].count).toBe(3);
  });
});

describe('유동성', () => {
  it('비율의 분모에는 종결된 요청만 넣고 진행 중 요청은 따로 센다', () => {
    const { liquidity } = overview();

    expect(liquidity.concluded).toBe(2); // R1(선정), R2(마감 경과)
    expect(liquidity.open).toBe(1); // R3
    expect(liquidity.quoted).toEqual({ num: 1, den: 2 });
    expect(liquidity.awarded).toEqual({ num: 1, den: 2 });
    expect(liquidity.unanswered).toBe(1);
  });

  it('초대 열람률과 PG 응답률은 종결된 요청의 초대만 센다', () => {
    const { liquidity } = overview();
    // R1→P1(열람·견적), R2→P2(미열람·무응답). 테스트 PG(P4)와 진행 중 요청(R3)은 빠진다.
    expect(liquidity.inviteOpened).toEqual({ num: 1, den: 2 });
    expect(liquidity.pgResponded).toEqual({ num: 1, den: 2 });
  });

  it('소요 시간은 발송부터 첫 견적·선정까지의 중앙값이다', () => {
    const { liquidity } = overview();
    expect(liquidity.medianFirstQuoteMs).toBe(24 * HOUR); // R1, R3 모두 24시간 (테스트 PG 견적은 무시)
    expect(liquidity.medianAwardMs).toBe(120 * HOUR);
  });

  it('sent_at 이 비어 있으면 첫 초대 시각을 발송 시각으로 쓴다', () => {
    // R2 는 sent_at 이 없지만 11/5 초대로 3번째 주에 집계된다.
    expect(overview().weekly[2].requestsSent).toBe(1);
  });

  it('발송 시각을 알 수 없는 요청은 집계하지 않는다', () => {
    const input = fixture();
    input.invitations = input.invitations.filter((row) => row.rfpId !== 'R2');
    const result = computeOverview(input, { now: NOW, weeks: 4 });

    expect(result.weekly.map((row) => row.requestsSent)).toEqual([1, 0, 0, 1]);
    expect(result.liquidity.concluded).toBe(1);
    expect(result.exclusions).toMatchObject({ requestsWithoutSentAt: 1, sentAtFallbacks: 0 });
  });
});

describe('담당자가 합류하지 않은 PG사', () => {
  // 미리 등록만 된 P3 가 요청을 받고, 견적이 나가고, 선정까지 됐다.
  function withUnstaffedDeal() {
    const input = fixture();
    input.requests.push({ id: 'R6', buyerWsId: 'B2', status: 'awarded', deadline: at('2026-11-09T09:00:00Z'), sentAt: at('2026-11-04T01:00:00Z') });
    input.invitations.push({ rfpId: 'R6', pgWsId: 'P3', sentAt: at('2026-11-04T01:00:00Z'), openedAt: at('2026-11-04T02:00:00Z') });
    input.bids.push({ rfpId: 'R6', pgWsId: 'P3', submittedAt: at('2026-11-05T01:00:00Z') });
    input.awards.push({ rfpId: 'R6', pgWsId: 'P3', awardedAt: at('2026-11-06T01:00:00Z') });
    return computeOverview(input, { now: NOW, weeks: 4 });
  }

  it('받은 요청·견적·선정은 구매사 쪽 결과에 그대로 센다', () => {
    const { liquidity, weekly, funnel } = withUnstaffedDeal();

    expect(liquidity.concluded).toBe(3);
    expect(liquidity.quoted).toEqual({ num: 2, den: 3 });
    expect(liquidity.awarded).toEqual({ num: 2, den: 3 });
    expect(liquidity.inviteOpened).toEqual({ num: 2, den: 3 });
    expect(liquidity.pgResponded).toEqual({ num: 2, den: 3 });
    expect(weekly.map((row) => row.requestsQuoted)).toEqual([1, 0, 1, 1]);
    expect(weekly.map((row) => row.awards)).toEqual([0, 1, 1, 0]);
    expect(funnel.find((step) => step.key === 'awarded')?.count).toBe(2);
  });

  it('PG사별 현황에는 담당자 미합류로 표시해 보여준다', () => {
    const { pgs } = withUnstaffedDeal();

    expect(pgs.map((row) => [row.name, row.staffed])).toEqual([['PG 원', true], ['등록만 PG', false], ['PG 투', true]]);
    expect(pgs[1]).toMatchObject({ invited: 1, opened: 1, quoted: 1, won: 1, lastActiveDay: '2026-11-05' });
  });

  it('신규·활성 PG 수에는 넣지 않고, 요청이 없으면 표에도 보이지 않는다', () => {
    const withDeal = withUnstaffedDeal();
    expect(withDeal.weekly.map((row) => row.newPgs)).toEqual([0, 0, 1, 0]);
    expect(withDeal.weekly.map((row) => row.activePgs)).toEqual([0, 0, 0, 2]);
    expect(withDeal.exclusions.registeredOnlyPgs).toBe(1);

    expect(overview().pgs.every((row) => row.staffed)).toBe(true);
  });
});

describe('PG별 현황', () => {
  it('집계 대상 PG 만 보여주고 재견적 회차는 한 번만 센다', () => {
    const { pgs } = overview();

    expect(pgs.map((row) => row.name)).toEqual(['PG 원', 'PG 투']);
    expect(pgs[0]).toMatchObject({ invited: 2, opened: 2, quoted: 2, won: 1, lastActiveDay: '2026-11-13' });
    expect(pgs[1]).toMatchObject({ invited: 1, opened: 0, quoted: 0, won: 0, lastActiveDay: '2026-11-10' });
  });
});

describe('활성 사용자 (행동 기준)', () => {
  it('오늘을 뺀 완결된 날짜만 세고 제외 대상의 행동은 빼낸다', () => {
    const { active } = overview();

    expect(active.day).toEqual({ users: 1, buyers: 1, pgs: 0 }); // 11/14: u1
    expect(active.week).toEqual({ users: 3, buyers: 1, pgs: 2 }); // 11/8~11/14
    expect(active.month).toEqual({ users: 3, buyers: 1, pgs: 2 });
  });
});

describe('가입 유입 경로', () => {
  it('워크스페이스를 만든 사용자의 유입 경로별로 생성·승인·요청을 센다', () => {
    const { sources } = overview();

    expect(sources).toHaveLength(3);
    expect(sources).toEqual(expect.arrayContaining([
      { label: 'google / cpc', created: 1, approved: 1, requested: 1 },
      { label: 'naver.com', created: 1, approved: 1, requested: 1 },
      { label: UNKNOWN_SOURCE, created: 1, approved: 0, requested: 0 },
    ]));
  });

  it('UTM → 외부 referrer 도메인 → 알 수 없음 순으로 표시한다', () => {
    expect(sourceLabel({ utmSource: 'newsletter' })).toBe('newsletter');
    expect(sourceLabel({ utmSource: 'google', utmMedium: 'cpc', referrer: 'https://x.example' })).toBe('google / cpc');
    expect(sourceLabel({ referrer: 'https://www.naver.com/search?q=secret' })).toBe('naver.com');
    expect(sourceLabel({ referrer: 'not a url' })).toBe(UNKNOWN_SOURCE);
    expect(sourceLabel(null)).toBe(UNKNOWN_SOURCE);
    expect(sourceLabel({ utmSource: 42 })).toBe(UNKNOWN_SOURCE);
  });
});

describe('제외 규칙', () => {
  it('시스템 계정, 테스트 워크스페이스와 그 요청, 담당자 미합류 PG 를 따로 센다', () => {
    expect(overview().exclusions).toEqual({
      users: 2, // sys2, sys3
      workspaces: 2, // B3, P4
      registeredOnlyPgs: 1, // P3
      requests: 1, // R4 (테스트 구매사의 요청)
      requestsWithoutSentAt: 0,
      sentAtFallbacks: 1, // R2
      domains: [],
    });
  });

  it('내부 도메인 직원만 있는 워크스페이스와 그 계정을 제외한다', () => {
    const input = fixture();
    input.members = input.members.map((row) => (row.userId === 'u2' ? { ...row, email: 'staff@internal.example' } : row));
    const result = computeOverview(input, { now: NOW, weeks: 4, excludedDomains: ['internal.example'] });

    expect(result.exclusions).toMatchObject({ users: 3, workspaces: 3, domains: ['internal.example'] });
    expect(result.funnel[0].count).toBe(2); // B2 가 코호트에서 빠진다
    expect(result.weekly.map((row) => row.requestsSent)).toEqual([1, 0, 1, 0]); // R3 도 빠진다
  });

  it('외부 고객과 함께 있는 내부 직원은 워크스페이스를 제외시키지 않는다', () => {
    const input = fixture();
    input.members.push(member('B2', 'staff', { email: 'staff@internal.example' }));
    const result = computeOverview(input, { now: NOW, weeks: 4, excludedDomains: ['internal.example'] });

    expect(result.exclusions.workspaces).toBe(2);
    expect(result.funnel[0].count).toBe(3);
  });
});

describe('빈 데이터', () => {
  it('분모가 0 이어도 숫자가 깨지지 않는다', () => {
    const empty: MetricsInput = {
      workspaces: [], members: [], approvals: [], requests: [], invitations: [], bids: [], awards: [], activity: [],
    };
    const result = computeOverview(empty, { now: NOW, weeks: 4 });

    expect(result.weekly).toHaveLength(4);
    expect(result.funnel.every((step) => step.count === 0 && step.medianFromPrevMs === null)).toBe(true);
    expect(result.liquidity).toMatchObject({
      concluded: 0, open: 0, unanswered: 0,
      quoted: { num: 0, den: 0 }, pgResponded: { num: 0, den: 0 },
      medianFirstQuoteMs: null, medianAwardMs: null,
    });
    expect(result.pgs).toEqual([]);
    expect(result.sources).toEqual([]);
    expect(result.active.month).toEqual({ users: 0, buyers: 0, pgs: 0 });
  });
});

describe('median', () => {
  it('홀수·짝수 개수와 빈 배열을 처리한다', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBeNull();
  });
});
