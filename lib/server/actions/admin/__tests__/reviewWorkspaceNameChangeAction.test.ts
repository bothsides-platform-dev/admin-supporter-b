import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  sessionError: null as Error | null,
  revalidatePath: vi.fn(),
}));

vi.mock('@/lib/auth/admin-session', () => ({
  requireAdminSession: () => mocks.sessionError
    ? Promise.reject(mocks.sessionError)
    : Promise.resolve({ adminId: 'ops@example.com' }),
}));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));

import {
  approveWorkspaceNameChangeAction,
  rejectWorkspaceNameChangeAction,
} from '../reviewWorkspaceNameChangeAction';

let client: PGlite;
let db: ReturnType<typeof drizzle>;

beforeEach(async () => {
  mocks.sessionError = null;
  mocks.revalidatePath.mockReset();
  client = new PGlite();
  await client.exec(`
    CREATE TABLE workspaces (id uuid PRIMARY KEY, type text NOT NULL, name text NOT NULL, status text NOT NULL DEFAULT 'active', updated_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE workspace_name_change_requests (
      id uuid PRIMARY KEY, workspace_id uuid NOT NULL, requested_by_user_id uuid NOT NULL,
      current_name text NOT NULL, requested_name text NOT NULL, status text NOT NULL DEFAULT 'pending',
      reviewed_by text, reason text, submitted_at timestamptz NOT NULL DEFAULT now(), reviewed_at timestamptz,
      CHECK (status IN ('pending', 'approved', 'rejected')),
      CHECK (current_name <> requested_name)
    );
    CREATE UNIQUE INDEX workspace_name_change_requests_one_pending_uniq
      ON workspace_name_change_requests (workspace_id) WHERE status = 'pending';
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
    expect((await client.query<{ action: string; payload_json: unknown }>('SELECT action, payload_json FROM admin_audit_logs')).rows[0]).toEqual({
      action: 'workspace.name_change_approve',
      payload_json: { before: { name: '기존 이름' }, after: { name: '새 이름' } },
    });
    expect(mocks.revalidatePath.mock.calls.map(([path]) => path)).toEqual([
      '/name-change-requests',
      `/name-change-requests/${requestId}`,
      `/buyers/${workspaceId}`,
    ]);
  });

  it('거절하면 현재 이름을 유지하고 사유를 기록한다', async () => {
    const { workspaceId, requestId } = await seed();
    await rejectWorkspaceNameChangeAction(db, requestId, '증빙이 필요합니다.');

    expect((await client.query<{ name: string }>('SELECT name FROM workspaces WHERE id=$1', [workspaceId])).rows[0].name).toBe('기존 이름');
    expect((await client.query<{ status: string; reason: string }>('SELECT status, reason FROM workspace_name_change_requests WHERE id=$1', [requestId])).rows[0]).toMatchObject({ status: 'rejected', reason: '증빙이 필요합니다.' });
    expect((await client.query<{ action: string; payload_json: unknown }>('SELECT action, payload_json FROM admin_audit_logs')).rows[0]).toEqual({
      action: 'workspace.name_change_reject',
      payload_json: {
        before: { name: '기존 이름' },
        after: { name: '기존 이름' },
        reason: '증빙이 필요합니다.',
      },
    });
  });

  it('이미 처리된 요청은 다시 처리하지 않는다', async () => {
    const { requestId } = await seed();
    await approveWorkspaceNameChangeAction(db, requestId);
    await expect(approveWorkspaceNameChangeAction(db, requestId)).rejects.toThrow('REQUEST_NOT_PENDING');
    await expect(rejectWorkspaceNameChangeAction(db, requestId, '뒤늦은 거절')).rejects.toThrow('REQUEST_NOT_PENDING');
  });

  it('요청 뒤 워크스페이스가 정지되면 승인하지 않는다', async () => {
    const { workspaceId, requestId } = await seed();
    await client.query(`UPDATE workspaces SET status='suspended' WHERE id=$1`, [workspaceId]);

    await expect(approveWorkspaceNameChangeAction(db, requestId)).rejects.toThrow('WORKSPACE_NOT_ACTIVE');
    expect((await client.query<{ name: string }>('SELECT name FROM workspaces WHERE id=$1', [workspaceId])).rows[0].name).toBe('기존 이름');
    expect((await client.query<{ status: string }>('SELECT status FROM workspace_name_change_requests WHERE id=$1', [requestId])).rows[0].status).toBe('pending');
  });

  it('인증되지 않은 호출은 트랜잭션 전에 거부한다', async () => {
    const { requestId } = await seed();
    mocks.sessionError = new Error('UNAUTHENTICATED');

    await expect(approveWorkspaceNameChangeAction(db, requestId)).rejects.toThrow('UNAUTHENTICATED');
    expect((await client.query<{ status: string }>('SELECT status FROM workspace_name_change_requests WHERE id=$1', [requestId])).rows[0].status).toBe('pending');
  });

  it('존재하지 않는 요청과 빈 거절 사유를 거부한다', async () => {
    const missingId = '20000000-0000-4000-8000-000000000099';
    await expect(approveWorkspaceNameChangeAction(db, missingId)).rejects.toThrow('REQUEST_NOT_PENDING');
    await expect(rejectWorkspaceNameChangeAction(db, missingId, '거절 사유')).rejects.toThrow('REQUEST_NOT_PENDING');
    await expect(rejectWorkspaceNameChangeAction(db, missingId, '   ')).rejects.toThrow('REASON_REQUIRED');
  });

  it('요청 뒤 현재 이름이 달라지면 승인 전체를 롤백한다', async () => {
    const { workspaceId, requestId } = await seed();
    await client.query(`UPDATE workspaces SET name='다른 이름' WHERE id=$1`, [workspaceId]);

    await expect(approveWorkspaceNameChangeAction(db, requestId)).rejects.toThrow('WORKSPACE_NOT_ACTIVE');
    expect((await client.query<{ status: string }>('SELECT status FROM workspace_name_change_requests WHERE id=$1', [requestId])).rows[0].status).toBe('pending');
    expect((await client.query<{ count: number }>('SELECT count(*)::int AS count FROM admin_audit_logs')).rows[0].count).toBe(0);
  });

  it('워크스페이스가 삭제된 요청도 거절하고 이력과 목록 캐시를 갱신한다', async () => {
    const { workspaceId, requestId } = await seed();
    await client.query('DELETE FROM workspaces WHERE id=$1', [workspaceId]);

    await rejectWorkspaceNameChangeAction(db, requestId, '회사를 확인할 수 없습니다.');
    expect((await client.query<{ status: string }>('SELECT status FROM workspace_name_change_requests WHERE id=$1', [requestId])).rows[0].status).toBe('rejected');
    expect(mocks.revalidatePath.mock.calls.map(([path]) => path)).toEqual([
      '/name-change-requests',
      `/name-change-requests/${requestId}`,
    ]);
  });

  it('CAS 경합에서 요청 claim을 잃으면 후속 쓰기를 하지 않는다', async () => {
    const requestId = '20000000-0000-4000-8000-000000000001';
    const tx = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => [{
              id: requestId,
              workspaceId: '10000000-0000-4000-8000-000000000001',
              currentName: '기존 이름',
              requestedName: '새 이름',
              status: 'pending',
            }],
          }),
        }),
      }),
      update: () => ({ set: () => ({ where: () => ({ returning: async () => [] }) }) }),
    };
    const fakeDb = { transaction: async (fn: (handle: unknown) => unknown) => fn(tx) };

    await expect(approveWorkspaceNameChangeAction(fakeDb, requestId)).rejects.toThrow('REQUEST_NOT_PENDING');
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it('DB 제약이 잘못된 상태·동일 이름·두 번째 pending 요청을 막는다', async () => {
    const { workspaceId } = await seed();
    const values = ['21000000-0000-4000-8000-000000000001', workspaceId, '31000000-0000-4000-8000-000000000001'];
    await expect(client.query(`INSERT INTO workspace_name_change_requests (id, workspace_id, requested_by_user_id, current_name, requested_name, status) VALUES ($1,$2,$3,'A','B','invalid')`, values)).rejects.toThrow();
    await expect(client.query(`INSERT INTO workspace_name_change_requests (id, workspace_id, requested_by_user_id, current_name, requested_name, status) VALUES ($1,$2,$3,'A','A','rejected')`, values)).rejects.toThrow();
    await expect(client.query(`INSERT INTO workspace_name_change_requests (id, workspace_id, requested_by_user_id, current_name, requested_name) VALUES ($1,$2,$3,'A','B')`, values)).rejects.toThrow();
  });
});
