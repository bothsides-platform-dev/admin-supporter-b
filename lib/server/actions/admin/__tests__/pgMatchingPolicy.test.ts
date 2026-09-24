import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { savePgMatchingPolicyAction, savePgMatchingDefaultsAction } from '../pgMatchingPolicy';
const auth = vi.hoisted(() => ({ denied: false }));
vi.mock('@/lib/auth/admin-session', () => ({ requireAdminPermission: async () => { if (auth.denied) throw new Error('UNAUTHENTICATED'); return { adminId: 'ops@example.com' }; } }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
let client: PGlite;
const groupId = '10000000-0000-4000-8000-000000000001';
const pg = '20000000-0000-4000-8000-000000000001';
const buyer = '20000000-0000-4000-8000-000000000002';
const candidate = { pgWorkspaceId: pg, reason: '온라인 판매 검토', feeMin: 0.8, feeMax: 0.9, feeNote: '부가세 별도' };
beforeEach(async () => {
  auth.denied = false;
  client = new PGlite();
  await client.exec(`
    CREATE TABLE workspaces (id uuid PRIMARY KEY, type text, status text);
    CREATE TABLE pg_recommendation_groups (id uuid PRIMARY KEY, name text);
    CREATE TABLE pg_matching_defaults (id text PRIMARY KEY, policy jsonb NOT NULL, updated_at timestamptz DEFAULT now());
    CREATE TABLE pg_matching_policies (group_id uuid PRIMARY KEY REFERENCES pg_recommendation_groups(id), policy jsonb NOT NULL, updated_at timestamptz DEFAULT now());
    CREATE TABLE admin_audit_logs (id uuid DEFAULT gen_random_uuid(), actor text, action text, entity_type text, entity_id uuid, payload_json jsonb, occurred_at timestamptz DEFAULT now());
    INSERT INTO workspaces VALUES ('${pg}', 'pg', 'active'), ('${buyer}', 'buyer', 'active');
    INSERT INTO pg_recommendation_groups VALUES ('${groupId}', '일반 판매');
  `);
});
afterEach(async () => { await client.close(); });
it('관리자 분류와 PG 순서·요율 조건을 저장하고 감사 기록을 남긴다', async () => {
  const policy = { risk: 'gray' as const, candidates: [candidate] };
  expect(await savePgMatchingPolicyAction(drizzle(client), { groupId, policy })).toEqual({ ok: true });
  expect((await client.query('SELECT policy FROM pg_matching_policies')).rows).toEqual([{ policy }]);
  expect((await client.query('SELECT action FROM admin_audit_logs')).rows).toEqual([{ action: 'pg_matching.policy_save' }]);
});
it('잘못된 요율·구매사 후보·중복 PG는 저장하지 않는다', async () => {
  for (const candidates of [[{ ...candidate, feeMax: 0.1 }], [{ ...candidate, pgWorkspaceId: buyer }], [candidate, candidate]]) {
    expect((await savePgMatchingPolicyAction(drizzle(client), { groupId, policy: { risk: 'white', candidates } })).ok).toBe(false);
  }
  expect((await client.query('SELECT * FROM pg_matching_policies')).rows).toEqual([]);
});
it('비인증 변경을 거부한다', async () => {
  auth.denied = true;
  await expect(savePgMatchingPolicyAction(drizzle(client), { groupId, policy: { risk: 'black', candidates: [] } })).rejects.toThrow('UNAUTHENTICATED');
});

it('기본 PG 후보 순서를 저장하고 감사 기록을 남긴다', async () => {
  const policy = { risk: 'gray' as const, candidates: [candidate] };
  expect(await savePgMatchingDefaultsAction(drizzle(client), policy)).toEqual({ ok: true });
  expect((await client.query('SELECT id, policy FROM pg_matching_defaults')).rows).toEqual([{ id: 'default', policy }]);
  expect((await client.query('SELECT action FROM admin_audit_logs')).rows).toEqual([{ action: 'pg_matching.defaults_save' }]);
});
it('기본 PG에는 활성 PG만 넣고 최소 한 곳과 추가 검토 분류를 요구한다', async () => {
  for (const policy of [{ risk: 'white', candidates: [candidate] }, { risk: 'gray', candidates: [] }, { risk: 'gray', candidates: [{ ...candidate, pgWorkspaceId: buyer }] }]) {
    expect((await savePgMatchingDefaultsAction(drizzle(client), policy)).ok).toBe(false);
  }
  await client.exec(`UPDATE workspaces SET status='suspended' WHERE id='${pg}'`);
  expect((await savePgMatchingDefaultsAction(drizzle(client), { risk: 'gray', candidates: [candidate] })).ok).toBe(false);
  expect((await client.query('SELECT * FROM pg_matching_defaults')).rows).toEqual([]);
});
it('기본 PG 변경에도 관리자 권한을 요구한다', async () => {
  auth.denied = true;
  await expect(savePgMatchingDefaultsAction(drizzle(client), { risk: 'gray', candidates: [candidate] })).rejects.toThrow('UNAUTHENTICATED');
});
