import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getMetricsOverview } from '../metrics';

const permission = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auth/admin-session', () => ({ requireAdminPermission: permission }));

type DB = Parameters<typeof getMetricsOverview>[1];

// 2026-11-15(일) 12:00 KST. 4주 창의 시작은 10/19(월) 00:00 KST.
const NOW = new Date('2026-11-15T03:00:00Z');
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const [BUYER, PG, TEST_PG] = [id(1), id(2), id(3)];
const [BUYER_USER, PG_USER, TEST_USER] = [id(11), id(12), id(13)];
const [RFP, DRAFT_RFP] = [id(21), id(22)];
const [BID, DRAFT_BID, TEST_BID] = [id(31), id(32), id(33)];

let client: PGlite;
let db: DB;

beforeEach(async () => {
  permission.mockReset().mockResolvedValue({ adminId: 'ops@example.com', role: 'super_admin' });
  client = new PGlite();
  // 조회가 읽는 컬럼만 둔다. 운영 스키마의 enum 은 text 로 대신한다.
  await client.exec(`
    CREATE TABLE workspaces (id uuid PRIMARY KEY, type text, name text, created_at timestamptz, canonical_pg_key text);
    CREATE TABLE users (id uuid PRIMARY KEY, email text, email_verified boolean, email_verified_at timestamptz,
      is_system_account boolean, signup_source jsonb);
    CREATE TABLE workspace_members (workspace_id uuid, user_id uuid, joined_at timestamptz, approval_status text);
    CREATE TABLE verification_applications (workspace_id uuid, status text, reviewed_at timestamptz);
    CREATE TABLE rfps (id uuid PRIMARY KEY, buyer_ws_id uuid, status text, deadline timestamptz, sent_at timestamptz);
    CREATE TABLE rfp_invitations (rfp_id uuid, pg_ws_id uuid, sent_at timestamptz, opened_at timestamptz);
    CREATE TABLE bids (id uuid PRIMARY KEY, rfp_id uuid, pg_ws_id uuid, status text, submitted_at timestamptz);
    CREATE TABLE contracts (rfp_id uuid, bid_id uuid, awarded_at timestamptz);
    CREATE TABLE audit_logs (actor_user_id uuid, actor_workspace_id uuid, action text, created_at timestamptz);
    CREATE TABLE chat_messages (author_user_id uuid, author_ws_id uuid, created_at timestamptz);

    INSERT INTO workspaces VALUES
      ('${BUYER}', 'buyer', '알파상사', '2026-10-20T01:00:00Z', null),
      ('${PG}', 'pg', 'PG 원', '2026-09-01T00:00:00Z', null),
      ('${TEST_PG}', 'pg', 'Test PG', '2026-09-01T00:00:00Z', null);
    INSERT INTO users VALUES
      ('${BUYER_USER}', 'buyer@customer.example', true, '2026-10-20T02:00:00Z', false, '{"_v":1,"utmSource":"google","utmMedium":"cpc"}'),
      ('${PG_USER}', 'pg@pg.example', true, '2026-09-01T00:00:00Z', false, '{}'),
      ('${TEST_USER}', 'qa@pg.example', true, '2026-09-01T00:00:00Z', false, '{}');
    INSERT INTO workspace_members VALUES
      ('${BUYER}', '${BUYER_USER}', '2026-10-20T01:00:00Z', 'approved'),
      ('${PG}', '${PG_USER}', '2026-09-01T00:00:00Z', 'approved'),
      ('${TEST_PG}', '${TEST_USER}', '2026-09-01T00:00:00Z', 'approved');
    INSERT INTO verification_applications VALUES
      ('${BUYER}', 'rejected', '2026-10-20T03:00:00Z'),
      ('${BUYER}', 'approved', '2026-10-21T01:00:00Z');
    INSERT INTO rfps VALUES
      ('${RFP}', '${BUYER}', 'awarded', '2026-10-29T09:00:00Z', '2026-10-22T01:00:00Z'),
      ('${DRAFT_RFP}', '${BUYER}', 'draft', '2026-11-30T09:00:00Z', null);
    INSERT INTO rfp_invitations VALUES
      ('${RFP}', '${PG}', '2026-10-22T01:00:00Z', '2026-10-22T03:00:00Z'),
      ('${RFP}', '${TEST_PG}', '2026-10-22T01:00:00Z', null);
    INSERT INTO bids VALUES
      ('${DRAFT_BID}', '${RFP}', '${PG}', 'draft', '2026-10-22T05:00:00Z'),
      ('${BID}', '${RFP}', '${PG}', 'submitted', '2026-10-23T01:00:00Z'),
      ('${TEST_BID}', '${RFP}', '${TEST_PG}', 'submitted', '2026-10-22T02:00:00Z');
    INSERT INTO contracts VALUES ('${RFP}', '${BID}', '2026-10-27T01:00:00Z');
    INSERT INTO audit_logs VALUES
      -- 11/14 23:30 KST: 어제의 활동
      ('${PG_USER}', '${PG}', 'bid.submit', '2026-11-14T14:30:00Z'),
      -- 11/15 00:30 KST: 오늘이라 완결된 날짜가 아니다
      ('${BUYER_USER}', '${BUYER}', 'rfp.create', '2026-11-14T15:30:00Z'),
      -- 허용 목록에 없는 기록은 활동이 아니다
      ('${BUYER_USER}', '${BUYER}', 'workspace.create', '2026-11-13T01:00:00Z'),
      ('${BUYER_USER}', '${BUYER}', 'signing.completed', '2026-11-13T01:00:00Z'),
      -- 워크스페이스가 없는 계정 작업
      ('${BUYER_USER}', null, 'rfp.create', '2026-11-13T01:00:00Z'),
      -- 조회 범위(30일) 밖
      ('${BUYER_USER}', '${BUYER}', 'rfp.create', '2026-09-01T01:00:00Z');
    INSERT INTO chat_messages VALUES
      ('${BUYER_USER}', '${BUYER}', '2026-11-12T10:00:00Z'),
      ('${BUYER_USER}', '${BUYER}', '2026-11-12T11:00:00Z');
  `);
  db = drizzle(client) as unknown as DB;
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await client.close();
});

const load = (options: Parameters<typeof getMetricsOverview>[0] = {}) =>
  getMetricsOverview({ now: NOW, weeks: 4, ...options }, db);

describe('getMetricsOverview', () => {
  it('조회 권한을 먼저 확인한다', async () => {
    permission.mockRejectedValue(new Error('PermissionDenied'));

    await expect(load()).rejects.toThrow('PermissionDenied');
    expect(permission).toHaveBeenCalledWith('data.view');
  });

  it('초안 요청·초안 견적·테스트 PG 를 빼고 주간 건수를 만든다', async () => {
    const { weekly } = await load();

    expect(weekly.map((row) => row.bucket.label)).toEqual(['10/19~10/25', '10/26~11/1', '11/2~11/8', '11/9~11/15']);
    expect(weekly.map((row) => row.newBuyers)).toEqual([1, 0, 0, 0]);
    expect(weekly.map((row) => row.buyerApprovals)).toEqual([1, 0, 0, 0]); // 거절된 신청은 세지 않는다
    expect(weekly.map((row) => row.requestsSent)).toEqual([1, 0, 0, 0]); // 초안 요청 제외
    expect(weekly.map((row) => row.requestsQuoted)).toEqual([1, 0, 0, 0]);
    expect(weekly.map((row) => row.awards)).toEqual([0, 1, 0, 0]);
  });

  it('퍼널과 유동성을 같은 기준으로 계산한다', async () => {
    const { funnel, liquidity, pgs, sources } = await load();

    expect(funnel.map((step) => step.count)).toEqual([1, 1, 1, 1, 1, 1]);
    expect(liquidity).toMatchObject({
      concluded: 1, open: 0, unanswered: 0,
      quoted: { num: 1, den: 1 }, awarded: { num: 1, den: 1 },
      inviteOpened: { num: 1, den: 1 }, pgResponded: { num: 1, den: 1 },
      // 초안 견적(10/22 05:00)과 테스트 PG 견적(10/22 02:00)이 아니라 제출 견적(10/23 01:00) 기준
      medianFirstQuoteMs: 24 * 3_600_000,
    });
    expect(pgs).toEqual([
      { id: PG, name: 'PG 원', staffed: true, invited: 1, opened: 1, quoted: 1, won: 1, lastActiveDay: '2026-11-14' },
    ]);
    expect(sources).toEqual([{ label: 'google / cpc', created: 1, approved: 1, requested: 1 }]);
  });

  it('활동은 허용 목록의 행동과 메시지만 KST 날짜로 센다', async () => {
    const { active, weekly } = await load();

    expect(active.day).toEqual({ users: 1, buyers: 0, pgs: 1 }); // 어제(11/14): PG 견적 제출
    expect(active.week).toEqual({ users: 2, buyers: 1, pgs: 1 }); // + 11/12 구매사 메시지
    expect(active.month).toEqual({ users: 2, buyers: 1, pgs: 1 });
    // 오늘(11/15 00:30 KST)의 요청 작성은 진행 중인 주의 활동으로는 잡힌다.
    expect(weekly[3]).toMatchObject({ activeBuyers: 1, activePgs: 1 });
  });

  it('제외 건수를 함께 돌려준다', async () => {
    const { exclusions } = await load();
    expect(exclusions).toEqual({
      users: 0, workspaces: 1, registeredOnlyPgs: 0,
      requests: 0, requestsWithoutSentAt: 0, sentAtFallbacks: 0, domains: [],
    });
  });

  it('환경변수의 내부 도메인을 기본 제외 기준으로 쓴다', async () => {
    vi.stubEnv('METRICS_EXCLUDED_EMAIL_DOMAINS', 'customer.example');
    const { exclusions, funnel, weekly } = await load();

    expect(exclusions).toMatchObject({ users: 1, workspaces: 2, requests: 1, domains: ['customer.example'] });
    expect(funnel[0].count).toBe(0);
    expect(weekly.every((row) => row.requestsSent === 0)).toBe(true);
  });

  it('데이터가 없어도 빈 지표를 돌려준다', async () => {
    await client.exec(`
      TRUNCATE workspaces, users, workspace_members, verification_applications, rfps,
        rfp_invitations, bids, contracts, audit_logs, chat_messages;
    `);
    const overview = await load();

    expect(overview.weekly).toHaveLength(4);
    expect(overview.funnel.every((step) => step.count === 0)).toBe(true);
    expect(overview.liquidity.quoted).toEqual({ num: 0, den: 0 });
    expect(overview.active.month).toEqual({ users: 0, buyers: 0, pgs: 0 });
  });
});
