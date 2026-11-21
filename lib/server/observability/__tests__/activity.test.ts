import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { loadActivity } from '../activity';
import { parseFilters, queryWindow } from '@/lib/observability/filters';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/actions/auth/_shared', () => ({ actionDb: vi.fn(() => { throw new Error('Production DB must not be used'); }) }));
const client = new PGlite();
const db = drizzle(client) as unknown as Parameters<typeof loadActivity>[2];
const now = new Date('2026-11-17T03:00:00Z');

beforeAll(async () => {
  await client.exec(`CREATE TABLE audit_logs (id uuid, actor_user_id uuid, actor_workspace_id uuid, action text, entity_type text, entity_id text, metadata jsonb, created_at timestamptz);
    INSERT INTO audit_logs VALUES
    ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', null, 'bid.submit', 'bid', 'P_100%', '{"email":"hidden@example.com","token":"hidden-secret"}', '2026-11-17T02:30:00Z'),
    ('00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000002', null, 'rfp.create', 'rfp', 'P-200', '{}', '2026-11-17T02:59:00Z'),
    ('00000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000002', null, 'bid.submit', 'bid', 'P_100%', '{}', '2026-11-16T01:00:00Z');`);
});
afterAll(async () => { await client.close(); });

it('선택 시간만 읽고 와일드카드를 문자 그대로 검색하며 민감정보를 제거한다', async () => {
  const filters = parseFilters({ view: 'activity', q: '_100%' }, now);
  const rows = await loadActivity(filters, queryWindow(filters, now), db);
  expect(rows).toHaveLength(1);
  expect(rows[0].message).toBe('bid.submit');
  expect(rows[0].details).not.toMatch(/hidden@example.com|hidden-secret/);
});
it('사용자 활동을 최신순으로 반환한다', async () => {
  const filters = parseFilters({ view: 'activity' }, now);
  const rows = await loadActivity(filters, queryWindow(filters, now), db);
  expect(rows.map(row => row.message)).toEqual(['rfp.create', 'bid.submit']);
});
