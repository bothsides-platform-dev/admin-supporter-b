import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ db: undefined as unknown, denied: false }));
vi.mock('@/lib/server/actions/auth/_shared', () => ({ actionDb: () => mocks.db }));
vi.mock('@/lib/auth/admin-session', () => ({ requireAdminPermission: async () => {
  if (mocks.denied) throw new Error('PermissionDenied');
  return { adminId: 'ops@example.com', role: 'operator' };
} }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
import { deleteAdminNoteAction } from '../deleteAdminNoteAction';
import { suspendUserAction } from '../suspendUserAction';
import { unsuspendUserAction } from '../unsuspendUserAction';
import { removeWorkspaceMemberAction } from '../removeWorkspaceMemberAction';
const userId = '10000000-0000-4000-8000-000000000001';
const secondId = '10000000-0000-4000-8000-000000000002';
const workspaceId = '20000000-0000-4000-8000-000000000001';
let client: PGlite;
beforeEach(async () => {
  mocks.denied = false;
  client = new PGlite();
  mocks.db = drizzle(client);
  await client.exec(`
    CREATE TABLE admin_notes (id uuid PRIMARY KEY, entity_type text, entity_id uuid, body text, created_by text, created_at timestamptz DEFAULT now());
    CREATE TABLE users (id uuid PRIMARY KEY, status text NOT NULL, deleted_at timestamptz);
    CREATE TABLE workspaces (id uuid PRIMARY KEY);
    CREATE TABLE workspace_members (workspace_id uuid, user_id uuid, role text NOT NULL);
    CREATE TABLE admin_audit_logs (id uuid DEFAULT gen_random_uuid(), actor text, action text, entity_type text, entity_id uuid, payload_json jsonb, occurred_at timestamptz DEFAULT now());
    INSERT INTO users VALUES ('${userId}', 'active', NULL), ('${secondId}', 'active', now());
    INSERT INTO workspaces VALUES ('${workspaceId}');
    INSERT INTO workspace_members VALUES ('${workspaceId}', '${userId}', 'admin'), ('${workspaceId}', '${secondId}', 'admin');
  `);
});
afterEach(async () => { await client.close(); });
describe('회원 상태 변경과 관리자 제외', () => {
  it('변경 전후를 기록하고 중복 처리는 로그를 추가하지 않는다', async () => {
    expect(await suspendUserAction(userId)).toEqual({ ok: true });
    expect(await suspendUserAction(userId)).toEqual({ ok: false, error: 'ALREADY_PROCESSED' });
    expect(await unsuspendUserAction(userId)).toEqual({ ok: true });
    const result = await client.query<{ payload_json: unknown }>('SELECT payload_json FROM admin_audit_logs ORDER BY occurred_at');
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].payload_json).toEqual({ before: { status: 'active' }, after: { status: 'suspended' } });
    expect(result.rows[1].payload_json).toEqual({ before: { status: 'suspended' }, after: { status: 'active' } });
  });
  it('탈퇴한 회원과 없는 회원에는 상태 변경 및 감사 로그를 만들지 않는다', async () => {
    expect(await unsuspendUserAction(secondId)).toEqual({ ok: false, error: 'NOT_FOUND' });
    expect(await suspendUserAction('10000000-0000-4000-8000-000000000099')).toEqual({ ok: false, error: 'NOT_FOUND' });
    expect((await client.query('SELECT * FROM admin_audit_logs')).rows).toHaveLength(0);
  });
  it('권한 없는 직접 액션 요청은 쓰기 전에 거부된다', async () => {
    mocks.denied = true;
    await expect(suspendUserAction(userId)).rejects.toThrow('PermissionDenied');
    expect((await client.query('SELECT * FROM admin_audit_logs')).rows).toHaveLength(0);
  });
  it('다른 관리자를 제외한 뒤 남은 마지막 관리자 제외를 거부한다', async () => {
    expect(await removeWorkspaceMemberAction(workspaceId, secondId)).toEqual({ ok: true });
    expect(await removeWorkspaceMemberAction(workspaceId, userId)).toEqual({ ok: false, error: 'LAST_ADMIN' });
    expect((await client.query('SELECT user_id FROM workspace_members')).rows).toEqual([{ user_id: userId }]);
  });
});

it('메모 삭제도 원래 대상의 이력에 삭제 내용을 남긴다', async () => {
  const noteId = '30000000-0000-4000-8000-000000000001';
  await client.query('INSERT INTO admin_notes (id, entity_type, entity_id, body, created_by) VALUES ($1, $2, $3, $4, $5)', [noteId, 'workspace', workspaceId, '검토 메모', 'ops@example.com']);
  expect(await deleteAdminNoteAction(noteId)).toEqual({ ok: true });
  expect(await deleteAdminNoteAction(noteId)).toEqual({ ok: false, error: 'NOT_FOUND' });
  const { rows } = await client.query('SELECT entity_type, entity_id, payload_json FROM admin_audit_logs');
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ entity_type: 'workspace', entity_id: workspaceId, payload_json: { before: { body: '검토 메모' }, after: {} } });
});
