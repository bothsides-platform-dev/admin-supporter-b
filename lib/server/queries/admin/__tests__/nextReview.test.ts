import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { actionDb } from '@/lib/server/actions/auth/_shared';
import { getNextReviewApplicationId } from '../nextReview';

let client: PGlite;
let db: ReturnType<typeof actionDb>;
const done = '20000000-0000-4000-8000-000000000099';
const old = '20000000-0000-4000-8000-000000000001';
const newest = '20000000-0000-4000-8000-000000000002';
const buyer = '20000000-0000-4000-8000-000000000003';
const pg = '20000000-0000-4000-8000-000000000004';
const moreInfo = '20000000-0000-4000-8000-000000000005';

beforeEach(async () => {
  client = new PGlite();
  await client.exec(`
    CREATE TABLE workspaces (id uuid PRIMARY KEY, name text NOT NULL);
    CREATE TABLE verification_applications (
      id uuid PRIMARY KEY, workspace_id uuid NOT NULL, org_type text NOT NULL,
      status text NOT NULL, submitted_at timestamptz NOT NULL
    );
    INSERT INTO workspaces VALUES
      ('10000000-0000-4000-8000-000000000001','오래된 PG'),
      ('10000000-0000-4000-8000-000000000002','같은날 구매사'),
      ('10000000-0000-4000-8000-000000000003','새 PG'),
      ('10000000-0000-4000-8000-000000000004','보완 중'),
      ('10000000-0000-4000-8000-000000000099','처리 완료');
    INSERT INTO verification_applications VALUES
      ('${old}','10000000-0000-4000-8000-000000000001','pg','submitted','2026-08-01T00:00:00Z'),
      ('${newest}','10000000-0000-4000-8000-000000000001','pg','submitted','2026-09-02T00:00:00Z'),
      ('${buyer}','10000000-0000-4000-8000-000000000002','buyer','submitted','2026-09-01T00:00:00Z'),
      ('${pg}','10000000-0000-4000-8000-000000000003','pg','review_pending','2026-09-01T00:00:00Z'),
      ('${moreInfo}','10000000-0000-4000-8000-000000000004','buyer','needs_more_info','2026-09-01T00:00:00Z'),
      ('${done}','10000000-0000-4000-8000-000000000099','buyer','approved','2026-08-01T00:00:00Z');
  `);
  db = drizzle(client) as unknown as ReturnType<typeof actionDb>;
});
afterEach(async () => { await client.close(); });

it('과거 신청을 건너뛰고 워크스페이스별 최신 대기 신청만 선택한다', async () => {
  expect(await getNextReviewApplicationId(done, '/review', db)).toBe(buyer);
  expect(await getNextReviewApplicationId(buyer, '/review', db)).toBe(pg);
  expect(await getNextReviewApplicationId(pg, '/review', db)).toBe(buyer);
  await client.query('UPDATE verification_applications SET status=$1 WHERE id=$2',['approved',newest]);
  expect(await getNextReviewApplicationId(done, '/review?type=pg', db)).toBe(pg);
  await client.query('UPDATE verification_applications SET status=$1 WHERE id=$2',['approved',pg]);
  expect(await getNextReviewApplicationId(done, '/review?type=pg', db)).toBeNull();
});

it('유형·상태·검색어·한국 날짜 필터를 현재 목록에서 이어받는다', async () => {
  expect(await getNextReviewApplicationId(done, '/review?type=pg', db)).toBe(pg);
  expect(await getNextReviewApplicationId(done, '/review?status=review_pending', db)).toBe(pg);
  expect(await getNextReviewApplicationId(done, '/review?status=needs_more_info', db)).toBe(moreInfo);
  expect(await getNextReviewApplicationId(done, '/review?q=%EC%83%88%20PG', db)).toBe(pg);
  expect(await getNextReviewApplicationId(done, '/review?from=2026-09-02&to=2026-09-02', db)).toBe(newest);
  expect(await getNextReviewApplicationId(done, '/review?status=approved', db)).toBeNull();
  expect(await getNextReviewApplicationId(done, '/review?status=all', db)).toBe(buyer);
});
