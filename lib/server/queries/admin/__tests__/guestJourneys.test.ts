import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getGuestJourney, listGuestJourneys } from '../guestJourneys';

const permission = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auth/admin-session', () => ({ requireAdminPermission: permission }));
const id = '10000000-0000-4000-8000-000000000001';
let client: PGlite;
beforeEach(async () => {
  permission.mockReset().mockResolvedValue({ adminId: 'ops@example.com', role: 'super_admin' });
  client = new PGlite();
  await client.exec(`
    CREATE TABLE users(id uuid PRIMARY KEY, name text, email text);
    CREATE TABLE workspaces(id uuid PRIMARY KEY, name text);
    CREATE TABLE guest_journeys(draft_id uuid PRIMARY KEY, secret_hash text, user_id uuid, workspace_id uuid,
      created_at timestamptz, retired_at timestamptz, deleted_at timestamptz, analytics jsonb);
    CREATE TABLE guest_journey_events(draft_id uuid, id text, payload jsonb, observed_at timestamptz, created_at timestamptz);
    INSERT INTO guest_journeys VALUES ('${id}', 'never-expose-proof', null, null, '2026-10-25T00:00:00Z', null, null, '[]');
  `);
});
afterEach(async () => { await client.close(); });

it('requires data.view before any query, including direct detail access', async () => {
  permission.mockRejectedValue(new Error('PermissionDenied'));
  await expect(getGuestJourney(id, {}, drizzle(client))).rejects.toThrow('PermissionDenied');
  await expect(listGuestJourneys({}, drizzle(client))).rejects.toThrow('PermissionDenied');
  expect(permission).toHaveBeenCalledWith('data.view');
});

it('shows anonymous journeys and never projects the ownership proof', async () => {
  const result = await listGuestJourneys({}, drizzle(client));
  expect(result.total).toBe(1);
  expect(result.rows[0]).toMatchObject({ draftId: id, userName: null, status: 'in_progress' });
  const detail = await getGuestJourney(id, {}, drizzle(client));
  expect(detail?.journey.draftId).toBe(id);
  expect(JSON.stringify([result, detail])).not.toContain('never-expose-proof');
  expect(await getGuestJourney('invalid', {}, drizzle(client))).toBeNull();
  expect(await getGuestJourney('10000000-0000-4000-8000-000000000099', {}, drizzle(client))).toBeNull();
});

it('retains repeated and late events, paginates deterministically, and shows latest full answers', async () => {
  for (let n = 0; n < 27; n++) {
    await client.query(`INSERT INTO guest_journey_events VALUES ($1, $2, $3, '2026-10-25T00:01:00Z', '2026-10-25T00:02:00Z')`,
      [id, String(n).padStart(3, '0'), JSON.stringify({ name: 'funnel_step_complete', funnel_id: 'questions', step_id: 'memo', answer: `${n}:` + '가'.repeat(490) })]);
  }
  await client.query(`INSERT INTO guest_journey_events VALUES ($1, 'server:request', $2, '2026-10-25T00:00:30Z', '2026-10-25T00:00:30Z')`, [id, JSON.stringify({ name: 'quote_request_submitted', funnel_id: 'request', step_id: 'submitted' })]);
  await client.exec(`UPDATE guest_journeys SET retired_at='2026-10-25T00:00:30Z'`);
  const detail = await getGuestJourney(id, { page: '2' }, drizzle(client));
  expect(detail).toMatchObject({ total: 28, page: 2, journey: { status: 'submitted' } });
  expect(detail?.events.map(e => e.id)).toEqual(['024', '025', '026']);
  expect(detail?.answers).toEqual([expect.objectContaining({ answer: '26:' + '가'.repeat(490) })]);
});

it('filters by draft ID and KST date, clamps pages, and distinguishes deletion from submission', async () => {
  await client.exec(`INSERT INTO guest_journeys SELECT gen_random_uuid(), 'proof', null, null, '2026-10-24T14:59:59Z', null, null, '[]' FROM generate_series(1,26)`);
  expect((await listGuestJourneys({ from: '2026-10-25', to: '2026-10-25' }, drizzle(client))).total).toBe(1);
  expect((await listGuestJourneys({ q: id }, drizzle(client))).total).toBe(1);
  expect((await listGuestJourneys({ page: '999' }, drizzle(client))).rows).toHaveLength(2);
  await client.exec(`UPDATE guest_journeys SET deleted_at=now(), retired_at=now() WHERE draft_id='${id}'`);
  expect((await listGuestJourneys({ status: 'deleted' }, drizzle(client))).total).toBe(1);
  expect((await listGuestJourneys({ status: 'submitted' }, drizzle(client))).total).toBe(0);
});

it('shows server successes beyond the browser event allowance', async () => {
  await client.query(`INSERT INTO guest_journey_events
    SELECT $1, 'browser:' || n, jsonb_build_object('name','funnel_step_view','funnel_id','questions','step_id','website'),
      '2026-10-25T00:01:00Z'::timestamptz, '2026-10-25T00:01:00Z'::timestamptz FROM generate_series(1,5000) AS n`, [id]);
  await client.query(`INSERT INTO guest_journey_events VALUES ($1, 'server:request', $2, '2026-10-25T00:02:00Z', '2026-10-25T00:02:00Z')`, [id, JSON.stringify({ name: 'quote_request_submitted', funnel_id: 'request', step_id: 'submitted' })]);
  const detail = await getGuestJourney(id, { page: '999' }, drizzle(client));
  expect(detail?.total).toBe(5001);
  expect(detail?.lastEvent?.name).toBe('quote_request_submitted');
  expect(detail?.events.map(e => e.id)).toEqual(['server:request']);
});
