import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { saveFollowup } from '../followups';
import { checkReminderReceipt, enqueueReminders, reminderHistory, reminderPreview } from '../rfpReminders';
import {
  followupTimeline,
  getTaskContext,
  listFollowups,
  taskCounts,
} from '@/lib/server/queries/admin/followups';
import { DrizzleOutboxRepository } from '@/lib/server/repositories/drizzle/outbox';
import { searchCustomers } from '@/lib/server/queries/admin/customerSearch';
import { readKstTime, toKstInput, validChannelUrl } from '@/lib/followups';
import { hasPermission } from '@/lib/auth/permissions';

const permission = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auth/admin-session', () => ({ requireAdminPermission: permission }));
const client = new PGlite();
const db = drizzle(client) as unknown as NonNullable<Parameters<typeof saveFollowup>[1]>;
const [buyer, pg, other, user, unapproved, rfp, rfp2, admin, inv, review, bid] = Array.from(
  { length: 11 },
  () => randomUUID(),
);
function form(values: Record<string, string>) {
  const result = new FormData();
  for (const [k, v] of Object.entries(values)) result.set(k, v);
  return result;
}
beforeAll(async () => {
  permission.mockResolvedValue({ adminId: 'agent@example.test', adminUserId: admin, role: 'operator' });
  await client.exec(`
    create table biz_profiles(id uuid primary key,biz_no text);
    create table pg_profiles(workspace_id uuid primary key,biz_no text);
    create table workspaces(id uuid primary key,name text,type text,status text default 'active',biz_profile_id uuid);
    create table users(id uuid primary key,email text,name text,status text default 'active', email_verified bool default true,
      password_hash text default 'hash', is_system_account bool default false,deleted_at timestamptz);
    create table workspace_members(workspace_id uuid,user_id uuid,approval_status text);
    create table rfps(id uuid primary key,code text,title text,buyer_ws_id uuid,status text default 'sent',deadline timestamptz default '2099-01-02T09:00Z');
    create table rfp_matching_requests(rfp_id uuid primary key);
    create table contracts(rfp_id uuid primary key);
    create table rfp_pg_reviews(id uuid primary key,rfp_id uuid,pg_ws_id uuid,status text,created_at timestamptz default now());
    create table pg_consultation_cases(review_id uuid primary key);
    create table rfp_invitations(id uuid primary key,rfp_id uuid,pg_ws_id uuid,status text,sent_at timestamptz default now(),expires_at timestamptz default '2099-02-01');
    create table bids(id uuid primary key,rfp_id uuid,pg_ws_id uuid,round int,status text,submitted_at timestamptz default now());
    create table rfp_requote_requests(rfp_id uuid,pg_ws_id uuid,round int,status text,deadline timestamptz);
    create table signing_contracts(id uuid primary key,rfp_id uuid,kind text,round int,created_at timestamptz);
    create table admin_users(id uuid primary key,email text);
    create table admin_audit_logs(id uuid primary key default gen_random_uuid(),actor text,action text,entity_type text,entity_id uuid,payload_json jsonb,occurred_at timestamptz default now());
    create table admin_followups(id uuid primary key,workspace_id uuid,rfp_id uuid,invitation_id uuid,review_id uuid,bid_id uuid,delivery_id uuid,signing_id uuid,
      category text,title text,owner_id uuid,due_at timestamptz,channel_url text,version int default 1,
      created_by text, created_at timestamptz default now(),completed_at timestamptz);
    create table admin_followup_updates(id uuid primary key default gen_random_uuid(),task_id uuid,actor text,note text,created_at timestamptz default now());
    create table outbox_entries(id uuid primary key default gen_random_uuid(),event text,to_addr text,subject text,html text,dedupe_key text,
      status text default 'pending',attempts int default 0,max_attempts int default 5,scheduled_at timestamptz default now(),sent_at timestamptz,
      last_error text,provider_message_id text,provider_event text,provider_checked_at timestamptz);
    create unique index outbox_key on outbox_entries(dedupe_key) where dedupe_key is not null;
    insert into workspaces(id,name,type) values ('${buyer}','같은회사','buyer'),('${pg}','같은회사','pg'),('${other}','예전 PG','pg');
    insert into pg_profiles values ('${pg}','123-45-67890');
    insert into users(id,email,name) values ('${user}','member@example.test','이담당'),('${unapproved}','pending@example.test','정대기');
    insert into workspace_members values ('${pg}','${user}','approved'),('${pg}','${unapproved}','pending'),('${other}','${user}','approved');
    insert into rfps(id,code,title,buyer_ws_id) values ('${rfp}','P-2611-0001','신청','${buyer}'),('${rfp2}','P-2611-0002','상담','${buyer}');
    insert into rfp_invitations(id,rfp_id,pg_ws_id,status) values ('${inv}','${rfp}','${pg}','opened');
    insert into rfp_matching_requests values ('${rfp2}');
    insert into rfp_pg_reviews(id,rfp_id,pg_ws_id,status) values ('${review}','${rfp2}','${other}','rejected');
    insert into bids(id,rfp_id,pg_ws_id,round,status) values ('${bid}','${rfp}','${pg}',1,'draft');
    insert into admin_users values ('${admin}','agent@example.test');`);
});
afterAll(() => client.close());

it('미연결 문의를 등록하고 RFP에 연결해 인계한다. 오래된 수정과 중복 완료는 거부한다', async () => {
  const id = randomUUID();
  const create = {
    id,
    mode: 'create',
    category: 'contact',
    title: '목요일 전화',
    due: '2020-01-02T11:00',
    note: '가입 전 문의',
  };
  expect(await saveFollowup(form(create), db)).toEqual({ ok: true });
  expect((await saveFollowup(form(create), db)).ok).toBe(false);
  expect((await taskCounts(db)).unassigned).toBe(1);
  expect((await listFollowups({ view: 'overdue' }, db)).rows[0].note).toBe('가입 전 문의');
  expect(await saveFollowup(form({ id, mode: 'link', version: '1', code: 'P-2611-0001' }), db)).toEqual({
    ok: true,
  });
  expect(
    await saveFollowup(
      form({ id, mode: 'update', version: '2', owner: admin, due: '2099-01-02T10:00', note: '조건표 보냄' }),
      db,
    ),
  ).toEqual({ ok: true });
  expect((await saveFollowup(form({ id, mode: 'complete', version: '2', note: '오래된 창' }), db)).ok).toBe(
    false,
  );
  expect((await listFollowups({ rfp }, db)).rows[0]).toMatchObject({
    owner: 'agent@example.test',
    note: '조건표 보냄',
    company: '같은회사',
  });
  expect(await saveFollowup(form({ id, mode: 'complete', version: '3', note: '구매사 확인' }), db)).toEqual({
    ok: true,
  });
  expect((await listFollowups({ view: 'done', workspace: buyer }, db)).rows[0].note).toBe('구매사 확인');
  expect((await listFollowups({ rfp }, db)).total).toBe(0);
  expect((await followupTimeline(id, undefined, db))?.rows.map((row) => row.note)).toEqual([
    '구매사 확인',
    '조건표 보냄',
    '가입 전 문의',
  ]);
});

it('초대·상담·견적을 원래 신청으로 검증하고 마감과 연락 약속을 구별한다', async () => {
  const base = { mode: 'create', category: 'terms', title: '조건 확인', rfp, due: '2099-01-01T10:15' };
  const ctx = await getTaskContext({ rfp }, db);
  expect(ctx?.rounds).toEqual([{ key: `invitation:${inv}`, label: '같은회사 · 초대', pgId: pg }]);
  for (const key of [`review:${review}`, `bid:${bid}`])
    expect((await saveFollowup(form({ ...base, id: randomUUID(), round: key }), db)).ok).toBe(false);
  expect(await saveFollowup(form({ ...base, id: randomUUID(), round: `invitation:${inv}` }), db)).toEqual({
    ok: true,
  });
  expect((await listFollowups({ workspace: pg }, db)).rows[0].roundLabel).toBe('같은회사 · 초대');
  expect(readKstTime('2026-02-30T12:00')).toBeNull();
  expect(toKstInput(readKstTime(base.due)!)).toBe(base.due);
  expect(validChannelUrl('https://desk.channel.io/channels/example')).toBe(true);
  expect(validChannelUrl('https://desk.channel.io.evil.test')).toBe(false);
});

it('회사·회원·RFP를 구분해 사업자번호와 코드를 찾고 검색 문자열을 그대로 처리한다', async () => {
  const groups = (await searchCustomers('같은회사', db)).map((x) => x.type);
  expect(groups).toEqual(expect.arrayContaining(['buyers', 'sellers', 'rfps']));
  expect(await searchCustomers('1234567890', db)).toMatchObject([{ id: pg, type: 'sellers' }]);
  expect(await searchCustomers('MEMBER@', db)).toMatchObject([{ type: 'users', id: user }]);
  expect(await searchCustomers('P-2611-0001', db)).toMatchObject([{ type: 'rfps', id: rfp }]);
  expect(await searchCustomers('%', db)).toEqual([]);
});

it('실제 초대와 승인 회원만 예약하고 재요청·자동 알림과 같은 키를 쓴다', async () => {
  const [t] = await reminderPreview(rfp, db);
  expect(t).toMatchObject({ pgId: pg, userId: user, round: 1 });
  expect(await reminderPreview(rfp2, db)).toEqual([]);
  expect(t.key).toBe(`reminder:${rfp}:${pg}:legacy:1:2099-01-02T09:00:00.000Z:${user}:email`);
  expect(await enqueueReminders(rfp, [t.token, t.token], '마감 일정 안내', db)).toEqual({
    ok: true,
    queued: 1,
    existing: 0,
  });
  expect(await enqueueReminders(rfp, [t.token], '재시도', db)).toEqual({ ok: true, queued: 0, existing: 1 });
  const [entry] = await reminderHistory(rfp, db);
  expect(entry).toMatchObject({ status: 'pending', messageId: null, pg: '같은회사' });
  const outbox = new DrizzleOutboxRepository(db);
  await client.query(
    "insert into outbox_entries(event,to_addr,subject,html) values ('rfp.consultation',$1,'상담 안내','상담 안내')",
    [t.email],
  );
  const invite = await outbox.enqueue({ event: 'rfp.invited', to: t.email, subject: '초대', html: '초대' });
  expect((await outbox.pending(10)).map((row) => row.id)).toEqual([invite!.id]);
  const adminSender = vi.fn().mockResolvedValue({ ok: true });
  expect(await outbox.flush(adminSender)).toEqual({ ok: 1, failed: 0 });
  expect(adminSender).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ id: invite!.id }));
  const pending = await client.query("select event from outbox_entries where status='pending' order by event");
  expect(pending.rows).toEqual([{ event: 'rfp.consultation' }, { event: 'rfp.deadline_reminder' }]);
  const exceptionId = randomUUID();
  expect(
    await saveFollowup(
      form({
        id: exceptionId,
        mode: 'create',
        category: 'delivery',
        title: '전달 결과 확인',
        due: '2099-02-01T10:00',
        rfp,
        round: `delivery:${entry.id}`,
        owner: admin,
      }),
      db,
    ),
  ).toEqual({ ok: true });
  const linkedTask = (await listFollowups({ workspace: pg }, db)).rows.find(
    (row) => row.task.id === exceptionId,
  );
  expect(linkedTask?.task).toMatchObject({ deliveryId: entry.id, ownerId: admin, rfpId: rfp });
  await client.query("update bids set status='submitted' where id=$1", [bid]);
  expect((await enqueueReminders(rfp, [t.token], '늦은 요청', db)).ok).toBe(false);
  await client.query("insert into rfp_requote_requests values ($1,$2,2,'pending','2099-02-01')", [rfp, pg]);
  expect(await reminderPreview(rfp, db)).toMatchObject([{ round: 2, pgId: pg }]);
  const lookup = vi.fn();
  expect((await checkReminderReceipt(rfp, entry.id, db, lookup)).ok).toBe(false);
  expect(lookup).not.toHaveBeenCalled();
  await client.query("update outbox_entries set provider_message_id='provider-1',status='sent' where id=$1", [
    entry.id,
  ]);
  lookup.mockResolvedValue({
    id: 'provider-1',
    to: [t.email],
    last_event: 'delivered',
    tags: [{ name: 'outbox_id', value: 'different' }],
  });
  expect((await checkReminderReceipt(rfp, entry.id, db, lookup)).ok).toBe(false);
  lookup.mockResolvedValue({
    id: 'provider-1',
    to: [t.email],
    last_event: 'bounced',
    tags: [{ name: 'outbox_id', value: entry.id }],
  });
  expect(await checkReminderReceipt(rfp, entry.id, db, lookup)).toEqual({ ok: true });
  expect((await reminderHistory(rfp, db))[0].event).toBe('bounced');
});

it('조회 역할의 업무 변경·발송·요율 변경을 막고 DB보다 먼저 권한을 확인한다', async () => {
  for (const p of ['tasks.write', 'reminders.send', 'agreement_rates.edit'] as const)
    expect(hasPermission({ role: 'viewer' }, p)).toBe(false);
  permission.mockRejectedValueOnce(new Error('denied'));
  await expect(saveFollowup(new FormData(), db)).rejects.toThrow('denied');
  permission.mockRejectedValueOnce(new Error('denied'));
  await expect(enqueueReminders(rfp, [], '', db)).rejects.toThrow('denied');
  expect(permission).toHaveBeenLastCalledWith('reminders.send');
});

it('상담 배정 대상으로 바뀐 회차의 이전 미리보기는 일반 마감 메일을 예약할 수 없다', async () => {
  const current = randomUUID();
  await client.query("insert into rfp_pg_reviews(id,rfp_id,pg_ws_id,status) values ($1,$2,$3,'reviewing')", [
    current, rfp2, pg,
  ]);
  const [target] = await reminderPreview(rfp2, db);
  expect(target).toMatchObject({ review: current, userId: user });
  await client.query('insert into pg_consultation_cases(review_id) values ($1)', [current]);
  expect(await reminderPreview(rfp2, db)).toEqual([]);
  expect(await enqueueReminders(rfp2, [target.token], '이전 미리보기', db)).toEqual({
    ok: false, error: 'RECIPIENTS_CHANGED',
  });
});
