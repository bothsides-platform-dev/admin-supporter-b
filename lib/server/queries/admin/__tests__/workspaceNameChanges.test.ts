import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { describe, expect, it } from 'vitest';
import { listWorkspaceNameChangeRequests } from '../workspaceNameChanges';

describe('listWorkspaceNameChangeRequests', () => {
  it('요청자와 워크스페이스 유형을 포함해 최신순으로 반환한다', async () => {
    const client = new PGlite();
    await client.exec(`
      CREATE TABLE users (id uuid PRIMARY KEY, name text NOT NULL, email text NOT NULL);
      CREATE TABLE workspaces (id uuid PRIMARY KEY, type text NOT NULL, name text NOT NULL);
      CREATE TABLE workspace_name_change_requests (
        id uuid PRIMARY KEY, workspace_id uuid NOT NULL, requested_by_user_id uuid NOT NULL,
        current_name text NOT NULL, requested_name text NOT NULL, status text NOT NULL,
        reviewed_by text, reason text, submitted_at timestamptz NOT NULL, reviewed_at timestamptz
      );
      INSERT INTO users VALUES ('30000000-0000-4000-8000-000000000001', '김담당', 'owner@example.com');
      INSERT INTO workspaces VALUES ('10000000-0000-4000-8000-000000000001', 'buyer', '기존 이름');
      INSERT INTO workspace_name_change_requests VALUES (
        '20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001',
        '30000000-0000-4000-8000-000000000001', '기존 이름', '새 이름', 'pending', null, null,
        '2026-09-05T00:00:00Z', null
      );
    `);

    expect(await listWorkspaceNameChangeRequests({}, drizzle(client))).toEqual([
      expect.objectContaining({
        workspaceType: 'buyer', requesterName: '김담당', currentName: '기존 이름', requestedName: '새 이름', status: 'pending',
      }),
    ]);

    await client.query(`DELETE FROM users WHERE id = '30000000-0000-4000-8000-000000000001'`);
    expect(await listWorkspaceNameChangeRequests({}, drizzle(client))).toEqual([
      expect.objectContaining({ requesterName: null, requesterEmail: null, requestedName: '새 이름' }),
    ]);

    await client.query(`DELETE FROM workspaces WHERE id = '10000000-0000-4000-8000-000000000001'`);
    expect(await listWorkspaceNameChangeRequests({}, drizzle(client))).toEqual([
      expect.objectContaining({ workspaceType: null, requesterName: null, requestedName: '새 이름' }),
    ]);
  });
});
