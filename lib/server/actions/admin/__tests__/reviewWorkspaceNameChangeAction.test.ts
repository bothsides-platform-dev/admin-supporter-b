import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth/admin-session', () => ({
  requireAdminSession: () => Promise.resolve({ adminId: 'ops@example.com' }),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import {
  approveWorkspaceNameChangeAction,
  rejectWorkspaceNameChangeAction,
} from '../reviewWorkspaceNameChangeAction';

let client: PGlite;
let db: ReturnType<typeof drizzle>;

beforeEach(async () => {
  client = new PGlite();
  await client.exec(`
    CREATE TABLE workspaces (id uuid PRIMARY KEY, type text NOT NULL, name text NOT NULL, status text NOT NULL DEFAULT 'active', updated_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE workspace_name_change_requests (
      id uuid PRIMARY KEY, workspace_id uuid NOT NULL REFERENCES workspaces(id), requested_by_user_id uuid NOT NULL,
      current_name text NOT NULL, requested_name text NOT NULL, status text NOT NULL DEFAULT 'pending',
      reviewed_by text, reason text, submitted_at timestamptz NOT NULL DEFAULT now(), reviewed_at timestamptz
    );
    CREATE TABLE admin_audit_logs (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor text NOT NULL, action text NOT NULL,
      entity_type text NOT NULL, entity_id uuid NOT NULL, payload_json jsonb, occurred_at timestamptz NOT NULL DEFAULT now()
    );
  `);
  db = drizzle(client);
});

async function seed() {
  const workspaceId = '10000000-0000-4000-8000-000000000001';
  const requestId = '20000000-0000-4000-8000-000000000001';
  const userId = '30000000-0000-4000-8000-000000000001';
  await client.query(`INSERT INTO workspaces (id, type, name) VALUES ($1, 'buyer', '기존 이름')`, [workspaceId]);
  await client.query(`INSERT INTO workspace_name_change_requests (id, workspace_id, requested_by_user_id, current_name, requested_name) VALUES ($1, $2, $3, '기존 이름', '새 이름')`, [requestId, workspaceId, userId]);
  return { workspaceId, requestId };
}

describe('workspace name change review', () => {
  it('승인하면 요청과 워크스페이스 이름을 한 트랜잭션에서 반영하고 감사를 남긴다', async () => {
    const { workspaceId, requestId } = await seed();
    await approveWorkspaceNameChangeAction(db, requestId);

    expect((await client.query<{ name: string }>('SELECT name FROM workspaces WHERE id=$1', [workspaceId])).rows[0].name).toBe('새 이름');
    expect((await client.query<{ status: string; reviewed_by: string }>('SELECT status, reviewed_by FROM workspace_name_change_requests WHERE id=$1', [requestId])).rows[0]).toMatchObject({ status: 'approved', reviewed_by: 'ops@example.com' });
    expect((await client.query<{ action: string }>('SELECT action FROM admin_audit_logs')).rows[0].action).toBe('workspace.name_change_approve');
  });

  it('거절하면 현재 이름을 유지하고 사유를 기록한다', async () => {
    const { workspaceId, requestId } = await seed();
    await rejectWorkspaceNameChangeAction(db, requestId, '증빙이 필요합니다.');

    expect((await client.query<{ name: string }>('SELECT name FROM workspaces WHERE id=$1', [workspaceId])).rows[0].name).toBe('기존 이름');
    expect((await client.query<{ status: string; reason: string }>('SELECT status, reason FROM workspace_name_change_requests WHERE id=$1', [requestId])).rows[0]).toMatchObject({ status: 'rejected', reason: '증빙이 필요합니다.' });
  });

  it('이미 처리된 요청은 다시 처리하지 않는다', async () => {
    const { requestId } = await seed();
    await approveWorkspaceNameChangeAction(db, requestId);
    await expect(approveWorkspaceNameChangeAction(db, requestId)).rejects.toThrow('REQUEST_NOT_PENDING');
  });

  it('요청 뒤 워크스페이스가 정지되면 승인하지 않는다', async () => {
    const { workspaceId, requestId } = await seed();
    await client.query(`UPDATE workspaces SET status='suspended' WHERE id=$1`, [workspaceId]);

    await expect(approveWorkspaceNameChangeAction(db, requestId)).rejects.toThrow('WORKSPACE_NOT_ACTIVE');
    expect((await client.query<{ name: string }>('SELECT name FROM workspaces WHERE id=$1', [workspaceId])).rows[0].name).toBe('기존 이름');
    expect((await client.query<{ status: string }>('SELECT status FROM workspace_name_change_requests WHERE id=$1', [requestId])).rows[0].status).toBe('pending');
  });
});
