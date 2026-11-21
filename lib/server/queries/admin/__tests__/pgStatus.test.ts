import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { listPgStatusPage } from '../pgStatus';

const permission = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auth/admin-session', () => ({ requireAdminPermission: permission }));

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const [alpha, beta, idle, buyer] = [1, 2, 3, 4].map(id);
const [later, sooner, closed, overdue, withdrawn, submitted, unsent] = [10, 11, 12, 13, 14, 15, 16].map(id);
let client: PGlite;
let db: NonNullable<Parameters<typeof listPgStatusPage>[1]>;

beforeEach(async () => {
  permission.mockReset().mockResolvedValue(undefined);
  client = new PGlite();
  await client.exec(`
    CREATE TABLE workspaces (id uuid PRIMARY KEY, name text, type text);
    CREATE TABLE rfps (id uuid PRIMARY KEY, title text, status text, deadline timestamptz);
    CREATE TABLE rfp_invitations (
      pg_ws_id uuid, rfp_id uuid, status text, sent_at timestamptz, opened_at timestamptz,
      PRIMARY KEY (rfp_id, pg_ws_id)
    );
    CREATE TABLE bids (pg_ws_id uuid, rfp_id uuid, round int, status text, PRIMARY KEY (rfp_id, pg_ws_id, round));
    INSERT INTO workspaces VALUES
      ('${alpha}', 'Alpha Pay', 'pg'), ('${beta}', 'Beta Pay', 'pg'),
      ('${idle}', 'Idle Pay', 'pg'), ('${buyer}', 'Buyer', 'buyer');
    INSERT INTO rfps VALUES
      ('${later}', '늦은 마감', 'sent', '2099-03-10T03:00:00Z'),
      ('${sooner}', '먼저 마감', 'sent', '2099-03-05T03:00:00Z'),
      ('${closed}', '마감 처리', 'closed', '2099-03-01T03:00:00Z'),
      ('${overdue}', '기한 경과', 'sent', '2000-01-01T03:00:00Z'),
      ('${withdrawn}', '견적 철회', 'sent', '2099-03-02T03:00:00Z'),
      ('${submitted}', '견적 제출', 'sent', '2099-03-03T03:00:00Z'),
      ('${unsent}', '초대 초안', 'sent', '2099-03-01T03:00:00Z');
    INSERT INTO rfp_invitations VALUES
      ('${alpha}', '${later}', 'opened', '2026-09-01T15:00:00Z', '2026-09-01T15:30:00Z'),
      ('${beta}', '${later}', 'pending', '2026-09-01T14:59:59Z', NULL),
      ('${alpha}', '${sooner}', 'pending', '2026-09-02T14:59:59Z', NULL),
      ('${alpha}', '${closed}', 'opened', '2026-08-31T00:00:00Z', '2026-08-31T01:00:00Z'),
      ('${alpha}', '${overdue}', 'expired', '2026-08-31T00:00:00Z', NULL),
      ('${alpha}', '${withdrawn}', 'pending', '2026-09-02T15:00:00Z', NULL),
      ('${alpha}', '${submitted}', 'pending', '2026-09-01T14:59:59Z', NULL),
      ('${alpha}', '${unsent}', 'draft', '2026-09-04T00:00:00Z', NULL),
      ('${idle}', '${later}', 'draft', '2026-09-04T00:00:00Z', NULL);
    INSERT INTO bids VALUES
      ('${alpha}', '${later}', 1, 'draft'), ('${beta}', '${later}', 1, 'submitted'),
      ('${alpha}', '${withdrawn}', 1, 'submitted'), ('${alpha}', '${withdrawn}', 2, 'withdrawn'),
      ('${alpha}', '${withdrawn}', 3, 'draft'), ('${alpha}', '${submitted}', 1, 'withdrawn'),
      ('${alpha}', '${submitted}', 2, 'submitted');
  `);
  db = drizzle(client) as unknown as typeof db;
});
afterEach(() => client.close());

describe('listPgStatusPage', () => {
  it('회차와 다른 PG의 응답을 중복 집계하지 않고 미제출 중 가장 가까운 진행 중 RFP를 고른다', async () => {
    const { rows, total } = await listPgStatusPage({}, db);

    expect(total).toBe(3);
    expect(rows.map((row) => row.id)).toEqual([alpha, beta, idle]);
    expect(rows[0]).toMatchObject({
      invited: 6, unopened: 2, openedWithoutBid: 2, submitted: 1, withdrawn: 1,
      lastSentAt: new Date('2026-09-02T15:00:00Z'),
      nextRfp: { id: sooner, title: '먼저 마감', deadline: new Date('2099-03-05T03:00:00Z') },
    });
    expect(rows[1]).toMatchObject({ invited: 1, unopened: 0, openedWithoutBid: 0, submitted: 1, withdrawn: 0, nextRfp: null });
    expect(rows[2]).toMatchObject({ invited: 0, unopened: 0, openedWithoutBid: 0, submitted: 0, withdrawn: 0, nextRfp: null, lastSentAt: null });
  });

  it('초대 발송일의 한국 시간 경계를 집계와 다음 마감에 함께 적용한다', async () => {
    const { rows } = await listPgStatusPage({ q: 'aLpHa', from: '2026-09-02', to: '2026-09-02' }, db);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: alpha, invited: 2, unopened: 1, openedWithoutBid: 1, submitted: 0, withdrawn: 0,
      nextRfp: { id: sooner }, lastSentAt: new Date('2026-09-02T14:59:59Z'),
    });
    const nextDay = await listPgStatusPage({ q: 'Alpha', from: '2026-09-03', to: '2026-09-03' }, db);
    expect(nextDay.rows[0]).toMatchObject({ invited: 1, withdrawn: 1, nextRfp: null });
  });

  it('같은 이름의 PG도 페이지에 한 번씩 표시하며 검색 결과의 마지막 페이지를 넘지 않는다', async () => {
    await client.exec("INSERT INTO workspaces SELECT gen_random_uuid(), 'Same Pay', 'pg' FROM generate_series(1, 27)");
    const first = await listPgStatusPage({ q: 'Same', sort: 'name' }, db);
    const last = await listPgStatusPage({ q: 'Same', sort: 'name', page: '99' }, db);
    expect(first.rows).toHaveLength(25);
    expect(last).toMatchObject({ page: 2, total: 27 });
    expect(new Set([...first.rows, ...last.rows].map((row) => row.id)).size).toBe(27);
    expect(await listPgStatusPage({ q: '없는 회사' }, db)).toMatchObject({ rows: [], page: 1, total: 0 });
  });

  it('조회 권한을 데이터베이스 접근 전에 확인한다', async () => {
    permission.mockRejectedValue(new Error('PermissionDenied'));
    await expect(listPgStatusPage({}, {} as typeof db)).rejects.toThrow('PermissionDenied');
    expect(permission).toHaveBeenCalledWith('data.view');
  });
});
