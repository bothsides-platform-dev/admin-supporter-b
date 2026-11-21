import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { actionDb } from '@/lib/server/actions/auth/_shared';
import { getNextReviewApplicationId } from '../nextReview';
import { REVIEW_OPEN_STATUS } from '@/lib/review-queue';
import { listApplicationsPage } from '../review';

let client: PGlite;
let db: ReturnType<typeof actionDb>;
const ws = (n: number) => `10000000-0000-4000-8000-00000000000${n}`;
const app = (n: number) => `20000000-0000-4000-8000-00000000000${n}`;

beforeEach(async () => {
  client = new PGlite();
  await client.exec(`
    CREATE TABLE workspaces (id uuid PRIMARY KEY, name text NOT NULL);
    CREATE TABLE verification_applications (
      id uuid PRIMARY KEY, workspace_id uuid NOT NULL, org_type text NOT NULL,
      status text NOT NULL, submitted_at timestamptz NOT NULL, reviewed_at timestamptz
    );
    INSERT INTO workspaces VALUES
      ('${ws(1)}','가 상사'), ('${ws(2)}','나 PG'), ('${ws(3)}','다 상사'), ('${ws(4)}','라 상사'), ('${ws(5)}','마 상사');
    INSERT INTO verification_applications VALUES
      ('${app(1)}','${ws(1)}','buyer','submitted','2026-09-03T00:00:00Z',NULL),
      ('${app(2)}','${ws(2)}','pg','review_pending','2026-09-01T00:00:00Z',NULL),
      ('${app(3)}','${ws(3)}','buyer','needs_more_info','2026-08-01T00:00:00Z',NULL),
      ('${app(4)}','${ws(4)}','buyer','approved','2026-07-01T00:00:00Z','2026-07-02T00:00:00Z'),
      ('${app(5)}','${ws(5)}','buyer','submitted','2026-09-02T00:00:00Z',NULL);
  `);
  db = drizzle(client) as unknown as ReturnType<typeof actionDb>;
});
afterEach(async () => { await client.close(); });

it('처리 대기 묶음은 신청됨·심사 중만 오래된 순으로 돌려준다', async () => {
  const { rows, total } = await listApplicationsPage({ status: REVIEW_OPEN_STATUS, sort: 'oldest' }, db);
  expect(total).toBe(3);
  expect(rows.map((row) => row.applicationId)).toEqual([app(2), app(5), app(1)]);
});

it('처리 대기 목록의 첫 건은 "다음 대기 건"이 고르는 건과 같다', async () => {
  const { rows } = await listApplicationsPage({ status: REVIEW_OPEN_STATUS, sort: 'oldest' }, db);
  const next = await getNextReviewApplicationId(app(4), `/review?status=${REVIEW_OPEN_STATUS}&sort=oldest`, db);
  expect(next).toBe(rows[0].applicationId);
});

it('전체 상태(all)와 상태 미지정은 모든 신청을 최신순으로 돌려준다', async () => {
  for (const status of ['all', undefined]) {
    const { rows, total } = await listApplicationsPage({ status }, db);
    expect(total).toBe(5);
    expect(rows[0].applicationId).toBe(app(1));
  }
});

it('단일 상태 필터는 그대로 동작한다', async () => {
  const { rows } = await listApplicationsPage({ status: 'needs_more_info' }, db);
  expect(rows.map((row) => row.applicationId)).toEqual([app(3)]);
});

it('대기 중인 신청에만 대기 일수를 붙인다', async () => {
  const { rows } = await listApplicationsPage({ status: 'all', sort: 'oldest' }, db);
  const byId = new Map(rows.map((row) => [row.applicationId, row.waitingDays]));
  expect(byId.get(app(4))).toBeNull();
  expect(byId.get(app(3))).toBeGreaterThan(0);
  expect(byId.get(app(2))).toBeGreaterThan(0);
});
