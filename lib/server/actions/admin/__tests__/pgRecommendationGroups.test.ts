import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  denied: false,
  revalidatePath: vi.fn(),
}));

vi.mock('@/lib/auth/admin-session', () => ({
  requireAdminPermission: () => mocks.denied
    ? Promise.reject(new Error('UNAUTHENTICATED'))
    : Promise.resolve({ adminId: 'ops@example.com', role: 'operator' }),
}));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));

import { savePgRecommendationGroupAction, deletePgRecommendationGroupAction } from '../pgRecommendationGroups';

let client: PGlite;
let db: ReturnType<typeof drizzle>;
const GROUP_A = '10000000-0000-4000-8000-000000000001';
const GROUP_B = '10000000-0000-4000-8000-000000000002';
const PG_A = '20000000-0000-4000-8000-000000000001';
const PG_B = '20000000-0000-4000-8000-000000000002';
const BUYER = '20000000-0000-4000-8000-000000000003';

beforeEach(async () => {
  mocks.denied = false;
  mocks.revalidatePath.mockReset();
  client = new PGlite();
  await client.exec(`
    CREATE TABLE workspaces (id uuid PRIMARY KEY, type text NOT NULL, name text NOT NULL, status text NOT NULL);
    CREATE TABLE pg_recommendation_groups (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL UNIQUE, sort_order integer NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE pg_recommendation_members (
      pg_ws_id uuid PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
      group_id uuid NOT NULL REFERENCES pg_recommendation_groups(id) ON DELETE CASCADE
    );
    CREATE TABLE admin_audit_logs (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor text NOT NULL, action text NOT NULL,
      entity_type text NOT NULL, entity_id uuid NOT NULL, payload_json jsonb,
      occurred_at timestamptz NOT NULL DEFAULT now()
    );
    INSERT INTO workspaces VALUES
      ('${PG_A}', 'pg', 'Alpha', 'active'),
      ('${PG_B}', 'pg', 'Beta', 'pending'),
      ('${BUYER}', 'buyer', '구매사', 'active');
  `);
  db = drizzle(client);
});

describe('PG 추천 업종 관리', () => {
  it('업종을 만들고 PG사를 지정하며 감사를 남긴다', async () => {
    const result = await savePgRecommendationGroupAction(db, {
      name: '  여행  ', sortOrder: 2, pgWorkspaceIds: [PG_A, PG_B],
    });
    expect(result).toMatchObject({ ok: true });
    const groups = await client.query<{ id: string; name: string; sort_order: number }>('SELECT id, name, sort_order FROM pg_recommendation_groups');
    expect(groups.rows).toEqual([{ id: expect.any(String), name: '여행', sort_order: 2 }]);
    expect((await client.query<{ pg_ws_id: string }>('SELECT pg_ws_id FROM pg_recommendation_members ORDER BY pg_ws_id')).rows)
      .toEqual([{ pg_ws_id: PG_A }, { pg_ws_id: PG_B }]);
    expect((await client.query<{ action: string }>('SELECT action FROM admin_audit_logs')).rows)
      .toEqual([{ action: 'pg_recommendation.group_save' }]);
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/pg-recommendations');
  });

  it('PG사를 다른 업종으로 옮기면 이전 업종에서 빠진다', async () => {
    await client.exec(`
      INSERT INTO pg_recommendation_groups (id, name) VALUES ('${GROUP_A}', '여행'), ('${GROUP_B}', '쇼핑');
      INSERT INTO pg_recommendation_members (pg_ws_id, group_id) VALUES ('${PG_A}', '${GROUP_A}');
    `);
    expect(await savePgRecommendationGroupAction(db, {
      id: GROUP_B, name: '쇼핑', sortOrder: 1, pgWorkspaceIds: [PG_A],
    })).toEqual({ ok: true, id: GROUP_B });
    expect((await client.query<{ group_id: string }>('SELECT group_id FROM pg_recommendation_members WHERE pg_ws_id=$1', [PG_A])).rows)
      .toEqual([{ group_id: GROUP_B }]);
  });

  it('구매사 ID가 섞이면 전체 변경을 거부한다', async () => {
    const result = await savePgRecommendationGroupAction(db, {
      name: '여행', sortOrder: 0, pgWorkspaceIds: [PG_A, BUYER],
    });
    expect(result).toEqual({ ok: false, error: 'PG_WORKSPACE_REQUIRED' });
    expect((await client.query('SELECT id FROM pg_recommendation_groups')).rows).toEqual([]);
  });

  it('업종을 삭제하면 소속 연결이 해제되고 감사가 남는다', async () => {
    await client.exec(`
      INSERT INTO pg_recommendation_groups (id, name) VALUES ('${GROUP_A}', '여행');
      INSERT INTO pg_recommendation_members (pg_ws_id, group_id) VALUES ('${PG_A}', '${GROUP_A}');
    `);
    expect(await deletePgRecommendationGroupAction(db, GROUP_A)).toEqual({ ok: true });
    expect((await client.query('SELECT * FROM pg_recommendation_groups')).rows).toEqual([]);
    expect((await client.query('SELECT * FROM pg_recommendation_members')).rows).toEqual([]);
    expect((await client.query<{ action: string }>('SELECT action FROM admin_audit_logs')).rows)
      .toEqual([{ action: 'pg_recommendation.group_delete' }]);
  });

  it('인증되지 않은 변경을 거부한다', async () => {
    mocks.denied = true;
    await expect(savePgRecommendationGroupAction(db, {
      name: '여행', sortOrder: 0, pgWorkspaceIds: [PG_A],
    })).rejects.toThrow('UNAUTHENTICATED');
    expect((await client.query('SELECT * FROM pg_recommendation_groups')).rows).toEqual([]);
  });
});
