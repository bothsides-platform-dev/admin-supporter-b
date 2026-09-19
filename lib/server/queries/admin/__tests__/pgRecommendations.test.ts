import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { describe, expect, it } from 'vitest';
import { listPgRecommendationGroups } from '../pgRecommendations';

describe('listPgRecommendationGroups', () => {
  it('업종마다 소속 PG를 반환하고 이름순으로 정렬한다', async () => {
    const client = new PGlite();
    await client.exec(`
      CREATE TABLE pg_recommendation_groups (id uuid PRIMARY KEY, name text NOT NULL, sort_order integer NOT NULL);
      CREATE TABLE workspaces (id uuid PRIMARY KEY, type text NOT NULL, name text NOT NULL, status text NOT NULL);
      CREATE TABLE pg_recommendation_members (group_id uuid NOT NULL, pg_ws_id uuid NOT NULL, PRIMARY KEY (group_id, pg_ws_id));
      INSERT INTO pg_recommendation_groups VALUES
        ('10000000-0000-4000-8000-000000000001', '여행', 2),
        ('10000000-0000-4000-8000-000000000002', '쇼핑', 1);
      INSERT INTO workspaces VALUES
        ('20000000-0000-4000-8000-000000000001', 'pg', 'Alpha PG', 'active'),
        ('20000000-0000-4000-8000-000000000002', 'pg', 'Beta PG', 'pending');
      INSERT INTO pg_recommendation_members VALUES
        ('10000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002'),
        ('10000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001');
    `);

    expect(await listPgRecommendationGroups(drizzle(client))).toEqual([
      {
        id: '10000000-0000-4000-8000-000000000002',
        name: '쇼핑',
        sortOrder: 1,
        pgWorkspaceIds: [
          '20000000-0000-4000-8000-000000000001',
          '20000000-0000-4000-8000-000000000002',
        ],
      },
      {
        id: '10000000-0000-4000-8000-000000000001',
        name: '여행',
        sortOrder: 2,
        pgWorkspaceIds: [],
      },
    ]);
  });
});
