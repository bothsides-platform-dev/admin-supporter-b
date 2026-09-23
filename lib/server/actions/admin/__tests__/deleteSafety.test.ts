import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { deleteWorkspaceAction } from '../deleteWorkspaceAction';
import { deleteUserAction } from '../deleteUserAction';
import { getUserDeletionImpact, getWorkspaceDeletionImpact } from '@/lib/server/queries/admin/deletion-impact';

let client: PGlite;
let db: ReturnType<typeof drizzle>;
vi.mock('@/lib/server/actions/auth/_shared', () => ({ actionDb: () => db }));
vi.mock('@/lib/auth/admin-session', () => ({ requireAdminPermission: async () => ({ adminId: 'admin@example.com', role: 'super_admin' }) }));
vi.mock('next/navigation', () => ({ redirect: (path: string) => { throw new Error(`REDIRECT:${path}`); } }));

const buyer = '10000000-0000-4000-8000-000000000001';
const seller = '10000000-0000-4000-8000-000000000002';
const rfp = '20000000-0000-4000-8000-000000000001';
const invitation = '30000000-0000-4000-8000-000000000001';
const bid = '40000000-0000-4000-8000-000000000001';
const user = '50000000-0000-4000-8000-000000000001';

beforeEach(async () => {
  client = new PGlite();
  db = drizzle(client);
  await client.exec(`
    CREATE TABLE workspaces (id uuid PRIMARY KEY, name text NOT NULL, type text NOT NULL, status text NOT NULL);
    CREATE TABLE admin_audit_logs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor text NOT NULL, action text NOT NULL, entity_type text NOT NULL, entity_id uuid NOT NULL, payload_json jsonb, occurred_at timestamptz DEFAULT now());
    CREATE TABLE users (id uuid PRIMARY KEY, email text NOT NULL, name text NOT NULL);
    CREATE TABLE biz_profiles (grade_confirmed_by uuid);
    CREATE TABLE rfps (id uuid PRIMARY KEY, buyer_ws_id uuid NOT NULL REFERENCES workspaces(id), created_by uuid);
    CREATE TABLE rfp_invitations (id uuid PRIMARY KEY, rfp_id uuid REFERENCES rfps(id) ON DELETE CASCADE, pg_ws_id uuid REFERENCES workspaces(id));
    CREATE TABLE bids (id uuid PRIMARY KEY, rfp_id uuid NOT NULL REFERENCES rfps(id) ON DELETE CASCADE, pg_ws_id uuid NOT NULL REFERENCES workspaces(id), invitation_id uuid REFERENCES rfp_invitations(id), submitted_by uuid);
    CREATE TABLE contracts (id uuid PRIMARY KEY, rfp_id uuid REFERENCES rfps(id) ON DELETE CASCADE, bid_id uuid REFERENCES bids(id), awarded_by uuid);
    CREATE TABLE pg_agreement_rates (pg_ws_id uuid PRIMARY KEY REFERENCES workspaces(id));
    CREATE TABLE workspace_members (workspace_id uuid, user_id uuid);
    CREATE TABLE verification_applications (workspace_id uuid);
    CREATE TABLE rfp_allowed_pg (rfp_id uuid, pg_ws_id uuid);
    CREATE TABLE rfp_pg_requests (rfp_id uuid, pg_ws_id uuid, created_by_user_id uuid);
    CREATE TABLE workspace_invitations (workspace_id uuid, invited_by_user_id uuid);
    CREATE TABLE rfp_requote_requests (rfp_id uuid, pg_ws_id uuid, created_by_user_id uuid);
    CREATE TABLE bid_notes (id uuid PRIMARY KEY, bid_id uuid, author_id uuid);
    CREATE TABLE attachments (rfp_id uuid, bid_id uuid, bid_note_id uuid, chat_message_id uuid, rfp_team_message_id uuid, uploaded_by uuid);
    CREATE TABLE chat_conversations (id uuid PRIMARY KEY, buyer_ws_id uuid, pg_ws_id uuid);
    CREATE TABLE chat_messages (id uuid PRIMARY KEY, conversation_id uuid, author_user_id uuid);
    CREATE TABLE rfp_team_messages (id uuid PRIMARY KEY, workspace_id uuid, rfp_id uuid, author_user_id uuid);
    CREATE TABLE notifications (workspace_id uuid);
    CREATE TABLE columns (workspace_id uuid);
    CREATE TABLE pg_profiles (workspace_id uuid);
    CREATE TABLE pg_recommendation_members (pg_ws_id uuid);
    CREATE TABLE bid_quote_templates (created_by uuid);
    CREATE TABLE chat_message_templates (created_by uuid);
    INSERT INTO users VALUES ('${user}', 'member@example.com', '테스트 회원');
    INSERT INTO workspaces VALUES ('${buyer}', '테스트 구매사', 'buyer', 'active'), ('${seller}', '테스트 PG', 'pg', 'active');
    INSERT INTO rfps (id, buyer_ws_id) VALUES ('${rfp}', '${buyer}');
    INSERT INTO rfp_invitations VALUES ('${invitation}', '${rfp}', '${seller}');
    INSERT INTO bids (id, rfp_id, pg_ws_id, invitation_id) VALUES ('${bid}', '${rfp}', '${seller}', '${invitation}');
    INSERT INTO contracts (id, rfp_id, bid_id) VALUES (gen_random_uuid(), '${rfp}', '${bid}');
    INSERT INTO attachments (rfp_id) VALUES ('${rfp}');
  `);
});

it('회원의 보존 대상 기록을 차단으로 표시하고 삭제 액션에서도 거부한다', async () => {
  await client.query('UPDATE rfps SET created_by = $1 WHERE id = $2', [user, rfp]);
  expect(await getUserDeletionImpact(user)).toEqual(expect.arrayContaining([{ label: '생성한 RFP', count: 1, kind: 'blocked' }]));
  expect(await deleteUserAction(user, '테스트 회원')).toMatchObject({ status: 'error' });
  expect((await client.query('SELECT * FROM users WHERE id = $1', [user])).rows).toHaveLength(1);
  expect((await client.query('SELECT * FROM admin_audit_logs')).rows).toHaveLength(0);
});

it('회원 삭제도 현재 이름을 서버에서 검증한다', async () => {
  expect(await deleteUserAction(user, '틀린 이름')).toMatchObject({ status: 'error' });
  expect((await client.query('SELECT * FROM users WHERE id = $1', [user])).rows).toHaveLength(1);
});
afterEach(async () => { await client.close(); });

it('확인 이름이 다르면 삭제와 감사 로그 기록을 모두 막는다', async () => {
  expect(await deleteWorkspaceAction(buyer, '/buyers', '다른 회사')).toMatchObject({ status: 'error' });
  expect((await client.query('SELECT id FROM workspaces WHERE id = $1', [buyer])).rows).toHaveLength(1);
  expect((await client.query('SELECT * FROM admin_audit_logs')).rows).toHaveLength(0);
});

it('연쇄 삭제될 RFP, 입찰, 계약, 첨부파일을 미리 센다', async () => {
  const impact = await getWorkspaceDeletionImpact(buyer);
  expect(impact).toEqual(expect.arrayContaining([
    { label: 'RFP', count: 1, kind: 'deleted' },
    { label: '입찰', count: 1, kind: 'deleted' },
    { label: '계약', count: 1, kind: 'deleted' },
    { label: '첨부파일', count: 1, kind: 'deleted' },
    { label: 'RFP 초대', count: 1, kind: 'deleted' },
  ]));
});

it('확인된 구매사 삭제 시 참조 순서대로 지우고 감사 기록을 남긴다', async () => {
  await expect(deleteWorkspaceAction(buyer, '/buyers', '테스트 구매사')).rejects.toThrow('REDIRECT:/buyers');
  expect((await client.query('SELECT * FROM workspaces WHERE id = $1', [buyer])).rows).toHaveLength(0);
  expect((await client.query('SELECT * FROM rfps')).rows).toHaveLength(0);
  expect((await client.query('SELECT * FROM bids')).rows).toHaveLength(0);
  expect((await client.query('SELECT action FROM admin_audit_logs')).rows).toEqual([{ action: 'workspace.hard_delete' }]);
});

it('감사 로그 삽입 뒤 삭제가 실패하면 전체 트랜잭션을 롤백한다', async () => {
  await client.exec(`CREATE FUNCTION deny_delete() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'blocked'; END $$;
    CREATE TRIGGER deny_workspace_delete BEFORE DELETE ON workspaces FOR EACH ROW EXECUTE FUNCTION deny_delete();`);
  await expect(deleteWorkspaceAction(buyer, '/buyers', '테스트 구매사')).rejects.toThrow('Failed query');
  expect((await client.query('SELECT * FROM admin_audit_logs')).rows).toHaveLength(0);
  expect((await client.query('SELECT * FROM rfps')).rows).toHaveLength(1);
  expect((await client.query('SELECT * FROM bids')).rows).toHaveLength(1);
});
