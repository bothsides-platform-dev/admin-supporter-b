import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { getRfpBoard, getRfpHistory } from '../rfpBoard';
import { BOARD_PAGE_SIZE } from '@/lib/rfp-board';

const permission = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auth/admin-session', () => ({ requireAdminPermission: permission }));
const client = new PGlite();
const db = drizzle(client) as unknown as NonNullable<Parameters<typeof getRfpBoard>[1]>;
beforeAll(async () => {
  await client.exec(`
    create table workspaces(id int primary key, name text);
    create table rfps(id text primary key, code text, title text, status text, buyer_ws_id int,
      deadline timestamptz, sent_at timestamptz default now(), created_at timestamptz default now(), updated_at timestamptz default now());
    create table rfp_matching_requests(rfp_id text primary key);
    create table rfp_pg_reviews(id int, rfp_id text, pg_ws_id int, status text, reason text, updated_at timestamptz default now(), created_at timestamptz default now());
    create table rfp_invitations(rfp_id text, pg_ws_id int, status text, sent_at timestamptz default now(), opened_at timestamptz);
    create table bids(id int, rfp_id text, pg_ws_id int, round int, status text, submitted_at timestamptz default now(), updated_at timestamptz default now());
    create table rfp_requote_requests(rfp_id text, pg_ws_id int, round int, status text, deadline timestamptz, created_at timestamptz);
    create table contracts(id int, rfp_id text, bid_id int, awarded_at timestamptz default now());
    create table signing_contracts(id int, rfp_id text, kind text, round int, status text, cancel_reason text, created_at timestamptz default now(),
      last_polled_at timestamptz, sent_at timestamptz, completed_at timestamptz, canceled_at timestamptz, expires_at timestamptz);
    insert into workspaces values (1,'구매사'), (2,'Alpha'), (3,'Beta'), (4,'Gamma');
    insert into rfps(id,code,title,status,buyer_ws_id,deadline) values
      ('a','A','기존 요청','sent',1,'2000-01-01'), ('b','B','순차 상담','sent',1,'2099-01-01'),
      ('c','C','합의서','awarded',1,'2000-01-01'), ('d','D','기존 계약','awarded',1,'2000-01-01'),
      ('e','E','취소 건','cancelled',1,'2000-01-01'), ('f','F','작성 중','draft',1,'2000-01-01');
    insert into rfp_invitations(rfp_id,pg_ws_id,status,opened_at) values ('a',2,'opened',now()),('a',3,'opened',now()),('a',4,'pending',null);
    insert into bids(id,rfp_id,pg_ws_id,round,status) values (1,'a',2,1,'submitted'),(2,'a',2,2,'submitted'),(3,'a',3,1,'draft'),
      (4,'b',2,1,'submitted'),(5,'b',3,1,'withdrawn'),(6,'c',2,1,'submitted'),(7,'d',3,1,'submitted');
    insert into rfp_matching_requests values ('b');
    insert into rfp_pg_reviews(id,rfp_id,pg_ws_id,status,reason) values (1,'b',2,'rejected','취급 불가'),(2,'b',3,'reviewing','');
    insert into contracts(id,rfp_id,bid_id) values (1,'c',6),(2,'d',7);
    insert into signing_contracts(id,rfp_id,kind,round,status) values (1,'c','pg_buyer',1,'completed'),
      (2,'c','platform_buyer',2,'canceled'),(3,'c','platform_buyer',3,'sent'),(4,'d','pg_buyer',1,'completed');
  `);
});
afterAll(() => client.close());

it('PG 수와 재견적 회차에 관계없이 한 장으로 집계하고 진행 단계와 마감 경과를 구분한다', async () => {
  const rows = await getRfpBoard({}, db);
  expect(rows).toHaveLength(5);
  expect(rows.find((r) => r.id === 'a')).toMatchObject({
    stage: 'selection',
    pgNames: 'Alpha, Beta, Gamma',
    overdue: true,
  });
  expect(rows.find((r) => r.id === 'b')).toMatchObject({
    stage: 'consulting',
    matching: true,
    pgNames: 'Beta',
  });
  expect(rows.find((r) => r.id === 'c')).toMatchObject({
    stage: 'signing',
    signing: 'sent',
    hasLegacy: true,
  });
  expect(rows.find((r) => r.id === 'd')).toMatchObject({ stage: 'awarded', signing: null, hasLegacy: true });
  expect(rows.find((r) => r.id === 'e')).toMatchObject({ stage: 'ended', overdue: false });
  expect(await getRfpBoard({ pg: 'alpha', q: '구매사', type: 'matching' }, db)).toMatchObject([{ id: 'b' }]);
  const history = await getRfpHistory('c', db);
  expect(history.signings.map((s) => [s.kind, s.status])).toEqual([
    ['platform_buyer', 'sent'],
    ['platform_buyer', 'canceled'],
    ['pg_buyer', 'completed'],
  ]);
});

it('단계별 전체 건수와 페이지에 해당하는 카드만 돌려준다', async () => {
  await client.exec(
    "insert into rfps(id,code,title,status,buyer_ws_id,deadline) select 'p'||i,'P'||i,'대량','sent',1,now() from generate_series(1,11) i",
  );
  const first = await getRfpBoard({ q: '대량' }, db);
  expect(first).toHaveLength(BOARD_PAGE_SIZE);
  const last = await getRfpBoard({ q: '대량', status: 'consulting', page: '90' }, db);
  expect(last).toHaveLength(11 - BOARD_PAGE_SIZE);
  expect(last[0]).toMatchObject({ total: 11, page: 2 });
  expect(new Set([...first, ...last].map((c) => c.id)).size).toBe(11);
});
it('권한 확인을 쿼리보다 먼저 수행한다', async () => {
  permission.mockRejectedValueOnce(new Error('denied'));
  await expect(getRfpBoard({}, db)).rejects.toThrow('denied');
  expect(permission).toHaveBeenCalledWith('data.view');
});
