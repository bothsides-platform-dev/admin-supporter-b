import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ denied: false, enqueue: vi.fn(), flush: vi.fn(), revalidate: vi.fn() }));
vi.mock('@/lib/auth/admin-session', () => ({
  requireAdminPermission: async () => {
    if (mocks.denied) throw new Error('FORBIDDEN');
    return { adminId: 'reviewer@example.com', role: 'reviewer' };
  },
}));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }));
vi.mock('@/lib/server/outbox/post-commit', () => ({ flushAfterCommit: mocks.flush }));
vi.mock('@/lib/server/repositories/drizzle/outbox', () => ({
  DrizzleOutboxRepository: class { enqueue = mocks.enqueue; },
}));
vi.mock('@/lib/server/outbox/templates/workspaceApproved', () => ({ renderWorkspaceApproved: async () => 'approved' }));
vi.mock('@/lib/server/outbox/templates/workspaceRejected', () => ({ renderWorkspaceRejected: async () => 'rejected' }));
import { approveWorkspaceAction } from '../approveWorkspaceAction';
import { rejectWorkspaceAction } from '../rejectWorkspaceAction';
import { requestMoreInfoAction, bulkRequestMoreInfoAction } from '../requestMoreInfoAction';
import { actionDb } from '@/lib/server/actions/auth/_shared';
import type { ReviewSnapshot } from '../reviewApplication';

let client: PGlite;
let db: ReturnType<typeof actionDb>;
const ws = '10000000-0000-4000-8000-000000000001';
const old = '20000000-0000-4000-8000-000000000001';
const current = '20000000-0000-4000-8000-000000000002';
const otherWs = '10000000-0000-4000-8000-000000000002';
const other = '20000000-0000-4000-8000-000000000003';
const submitted: ReviewSnapshot = { status: 'submitted', reviewedAt: null, reason: null };

beforeEach(async () => {
  mocks.denied = false;
  mocks.enqueue.mockReset(); mocks.flush.mockReset(); mocks.revalidate.mockReset();
  client = new PGlite();
  await client.exec(`
    CREATE TYPE workspace_type AS ENUM ('buyer','pg');
    CREATE TYPE workspace_status AS ENUM ('pending','active','suspended');
    CREATE TYPE verification_status AS ENUM ('submitted','review_pending','needs_more_info','approved','rejected');
    CREATE TYPE merchant_grade AS ENUM ('sole','sme1','sme2','sme3','general');
    CREATE TYPE grade_source AS ENUM ('user_confirmed','user_overridden','unset','admin_confirmed');
    CREATE TYPE tax_type AS ENUM ('general','simple','exempt');
    CREATE TYPE biz_status AS ENUM ('active','suspended','closed');
    CREATE TABLE biz_profiles (id uuid PRIMARY KEY, biz_no text, tax_type tax_type, status biz_status,
      grade merchant_grade, grade_source grade_source NOT NULL, grade_confirmed_by uuid,
      grade_confirmed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE workspaces (id uuid PRIMARY KEY, type workspace_type NOT NULL, name text NOT NULL,
      biz_profile_id uuid, status workspace_status NOT NULL DEFAULT 'pending', status_reason text,
      logo_updated_at timestamptz, reviewed_at timestamptz, canonical_pg_key text,
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE verification_applications (id uuid PRIMARY KEY, workspace_id uuid NOT NULL, org_type text NOT NULL,
      status verification_status NOT NULL DEFAULT 'submitted', reviewed_by text, reason text,
      submitted_at timestamptz NOT NULL DEFAULT now(), reviewed_at timestamptz);
    CREATE TABLE users (id uuid PRIMARY KEY, email text NOT NULL, email_verified boolean,
      name text NOT NULL DEFAULT '', phone text, password_hash text, status text NOT NULL DEFAULT 'active',
      signup_source jsonb, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
    CREATE TYPE member_role AS ENUM ('admin','member');
    CREATE TABLE workspace_members (id uuid PRIMARY KEY, workspace_id uuid NOT NULL, user_id uuid NOT NULL,
      role member_role NOT NULL, status text NOT NULL DEFAULT 'active', joined_at timestamptz,
      invited_at timestamptz, approved_at timestamptz, approved_by text,
      rejection_reason text, created_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE admin_audit_logs (id uuid DEFAULT gen_random_uuid() PRIMARY KEY, actor text NOT NULL,
      action text NOT NULL, entity_type text NOT NULL, entity_id uuid NOT NULL,
      payload_json jsonb, occurred_at timestamptz NOT NULL DEFAULT now());
    INSERT INTO workspaces (id,type,name) VALUES ('${ws}','buyer','구매사'),('${otherWs}','pg','PG사');
    INSERT INTO verification_applications (id,workspace_id,org_type,submitted_at)
      VALUES ('${old}','${ws}','buyer','2026-01-01'),('${current}','${ws}','buyer','2026-02-01'),
             ('${other}','${otherWs}','pg','2026-02-02');
  `);
  db = drizzle(client) as unknown as ReturnType<typeof actionDb>;
});
afterEach(async () => { await client.close(); });

it('오래된 신청은 처리하지 않고 최신 신청 하나만 변경한다', async () => {
  expect(await approveWorkspaceAction(db, old, 'sole', submitted)).toEqual({ ok: false, error: 'ALREADY_PROCESSED' });
  expect(await approveWorkspaceAction(db, current, 'sole', submitted)).toEqual({ ok: true });
  const rows = (await client.query<{ id: string; status: string }>('SELECT id,status FROM verification_applications WHERE workspace_id=$1 ORDER BY submitted_at', [ws])).rows;
  expect(rows).toEqual([{ id: old, status: 'submitted' }, { id: current, status: 'approved' }]);
  expect((await client.query<{ status: string }>('SELECT status FROM workspaces WHERE id=$1', [ws])).rows[0].status).toBe('active');
  const audit = (await client.query<{entity_type:string;entity_id:string;payload_json:{before:{status:string};after:{status:string;grade:string}}}>('SELECT entity_type,entity_id,payload_json FROM admin_audit_logs')).rows;
  expect(audit).toMatchObject([{ entity_type: 'verification_application', entity_id: current, payload_json: { before: {status:'submitted',grade:null}, after:{status:'approved',grade:'sole'} } }]);
});

it('처리된 신청에 대한 늦은 반려와 반복 승인을 거부하고 감사 로그를 늘리지 않는다', async () => {
  expect(await approveWorkspaceAction(db, current, 'sme1', submitted)).toEqual({ ok: true });
  expect(await rejectWorkspaceAction(db, current, '뒤늦은 반려', submitted)).toEqual({ ok: false, error: 'ALREADY_PROCESSED' });
  expect(await approveWorkspaceAction(db, current, 'sole', submitted)).toEqual({ ok: false, error: 'ALREADY_PROCESSED' });
  expect((await client.query('SELECT id FROM biz_profiles')).rows).toHaveLength(1);
  expect((await client.query('SELECT id FROM admin_audit_logs')).rows).toHaveLength(1);
});

it('보완 재요청을 각각 이력에 남기고 사유가 포함된 이전/새 상태를 기록한다', async () => {
  expect(await requestMoreInfoAction(db, current, '서류 누락', submitted)).toEqual({ ok: true });
  const updated = (await client.query<{ reviewed_at: Date }>('SELECT reviewed_at FROM verification_applications WHERE id=$1',[current])).rows[0];
  const afterFirst: ReviewSnapshot = { status: 'needs_more_info', reviewedAt: new Date(updated.reviewed_at).toISOString(), reason: '서류 누락' };
  expect(await requestMoreInfoAction(db, current, '주소 확인', afterFirst)).toEqual({ ok: true });
  expect(await requestMoreInfoAction(db, current, '오래된 탭의 재요청', afterFirst)).toEqual({ ok: false, error: 'ALREADY_PROCESSED' });
  const audit = (await client.query<{payload_json:{before:{status:string;reason:string|null};after:{status:string;reason:string};reason:string}}>('SELECT payload_json FROM admin_audit_logs ORDER BY occurred_at,id')).rows;
  expect(audit).toHaveLength(2);
  expect(audit[1].payload_json).toMatchObject({ before: { status: 'needs_more_info', reason: '서류 누락' }, after: { status: 'needs_more_info', reason: '주소 확인' }, reason: '주소 확인' });
  expect(mocks.enqueue).not.toHaveBeenCalled();
});

it('오래된 탭에서 보완 요청 후 승인하거나 같은 보완 요청을 덮어쓰지 못한다', async () => {
  expect(await requestMoreInfoAction(db, current, '먼저 요청한 사유', submitted)).toEqual({ ok: true });
  expect(await approveWorkspaceAction(db, current, 'sole', submitted)).toEqual({ ok: false, error: 'ALREADY_PROCESSED' });
  expect(await rejectWorkspaceAction(db, current, '늦은 반려', submitted)).toEqual({ ok: false, error: 'ALREADY_PROCESSED' });
  expect(await requestMoreInfoAction(db, current, '늦은 재요청', submitted)).toEqual({ ok: false, error: 'ALREADY_PROCESSED' });
  expect((await client.query<{ status: string; reason: string }>('SELECT status,reason FROM verification_applications WHERE id=$1',[current])).rows[0]).toEqual({ status: 'needs_more_info', reason: '먼저 요청한 사유' });
  expect((await client.query('SELECT id FROM admin_audit_logs')).rows).toHaveLength(1);
});

it('일괄 보완 요청은 유효한 최신 신청만 처리하고 결과를 요약한다', async () => {
  expect(await bulkRequestMoreInfoAction([old,current,other], '자료 보완', db)).toEqual({ ok: true, processed: 2, skipped: 1 });
  expect(await bulkRequestMoreInfoAction([current,other], '뒤늦은 일괄 변경', db)).toEqual({ ok: true, processed: 0, skipped: 2 });
  expect((await client.query('SELECT id FROM admin_audit_logs')).rows).toHaveLength(2);
});

it('잘못된 입력과 권한 부재에서는 쓰기를 실행하지 않는다', async () => {
  expect(await approveWorkspaceAction(db, 'bad-id', 'sole', submitted)).toEqual({ok:false,error:'INVALID_INPUT'});
  expect(await approveWorkspaceAction(db, current, 'fake' as never, submitted)).toEqual({ok:false,error:'INVALID_GRADE'});
  expect(await rejectWorkspaceAction(db, current, '  ', submitted)).toEqual({ok:false,error:'REASON_REQUIRED'});
  expect(await bulkRequestMoreInfoAction([current,current], '보완', db)).toEqual({ok:false,error:'INVALID_INPUT'});
  mocks.denied = true;
  await expect(approveWorkspaceAction(db, current, 'sole', submitted)).rejects.toThrow('FORBIDDEN');
  expect((await client.query('SELECT id FROM admin_audit_logs')).rows).toHaveLength(0);
});

it('감사 로그 저장 실패 시 신청 상태와 새 사업자 프로필을 함께 롤백한다', async () => {
  await client.exec(`
    CREATE FUNCTION reject_review_audit() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'audit unavailable'; END; $$;
    CREATE TRIGGER reject_review_audit BEFORE INSERT ON admin_audit_logs
      FOR EACH ROW EXECUTE FUNCTION reject_review_audit();
  `);
  await expect(approveWorkspaceAction(db, current, 'sole', submitted)).rejects.toThrow();
  expect((await client.query<{status:string}>('SELECT status FROM verification_applications WHERE id=$1',[current])).rows[0].status).toBe('submitted');
  expect((await client.query('SELECT id FROM biz_profiles')).rows).toHaveLength(0);
  expect(mocks.enqueue).not.toHaveBeenCalled();
  expect(mocks.flush).not.toHaveBeenCalled();
});

it('신청자에게는 성공한 결정만 알리고 신청 ID별 중복 키를 사용한다', async () => {
  const userId = '30000000-0000-4000-8000-000000000001';
  const memberId = '40000000-0000-4000-8000-000000000001';
  await client.query('INSERT INTO users(id,email,email_verified) VALUES ($1,$2,true)',[userId,'owner@example.com']);
  await client.query("INSERT INTO workspace_members(id,workspace_id,user_id,role) VALUES ($1,$2,$3,'admin')",[memberId,ws,userId]);
  expect(await approveWorkspaceAction(db, current, 'sole', submitted)).toEqual({ok:true});
  expect(mocks.enqueue).toHaveBeenCalledTimes(1);
  expect(mocks.enqueue.mock.calls[0][0]).toMatchObject({event:'workspace.approved',to:'owner@example.com',dedupeKey:`workspace-approved:${current}`});
  expect(await rejectWorkspaceAction(db, current, '늦은 요청', submitted)).toEqual({ok:false,error:'ALREADY_PROCESSED'});
  expect(mocks.enqueue).toHaveBeenCalledTimes(1);
  expect(mocks.flush).toHaveBeenCalledTimes(1);
});
