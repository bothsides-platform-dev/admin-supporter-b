import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { DB } from '@/lib/db';
import { caseHistory, correctionDraft, corrections, operationsQueue, policyFor } from '../queries';
import { confirmCorrection, reassign, adjudicate, savePolicy } from '../manage';
import { setAssignee } from '@/lib/server/actions/admin/consultations';
const gate = vi.hoisted(() => ({ denied: false }));
vi.mock('@/lib/auth/admin-session', () => ({
  requireAdminPermission: async () => {
    if (gate.denied) throw Error('PermissionDenied');
    return { adminId: 'ops' };
  },
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/server/actions/auth/_shared', () => ({ actionDb: () => db }));

let client: PGlite, db: DB, pg: string, other: string, manager: string, rep: string;
const actor = 'operator@example.test';
beforeEach(async () => {
  gate.denied = false;
  client = new PGlite();
  db = drizzle(client, { casing: 'snake_case' }) as unknown as DB;
  pg = randomUUID();
  other = randomUUID();
  manager = randomUUID();
  rep = randomUUID();
  // These tests consume the progress projection contract owned by the service app.
  await client.exec(`
    CREATE TABLE users(id uuid primary key,name text,email text,email_verified boolean default true,status text default 'active',deleted_at timestamptz);
    CREATE TABLE workspaces(id uuid primary key,name text,type text default 'pg',status text default 'active');
    CREATE TABLE workspace_members(user_id uuid,workspace_id uuid,approval_status text default 'approved');
    CREATE TABLE pg_recommendation_groups(id uuid,name text,sort_order int);
    CREATE TABLE pg_assignment_policies(pg_id uuid primary key,enabled boolean,alimtalk_ready boolean,manager_id uuid,contact_days int,threshold int,window_days int,roster jsonb);
    CREATE TABLE rfps(id uuid primary key,code text,status text default 'sent');
    CREATE TABLE rfp_pg_reviews(id uuid primary key,rfp_id uuid,pg_workspace_id uuid,status text default 'requested',created_at timestamptz default now());
    CREATE TABLE pg_consultation_cases(review_id uuid primary key,assignee uuid,revision int default 1,contact_due timestamptz default now()-interval '1 day',quote_due timestamptz default now()+interval '1 day',late_quote_due timestamptz,quoted_at timestamptz,consent_at timestamptz,consent_text text);
    CREATE TABLE pg_consultation_progress(review_id uuid,first_contact_at timestamptz,contact_late boolean default false,quote_late boolean default false,disputed boolean default false);
    CREATE TABLE pg_consultation_questions(id uuid primary key,review_id uuid,reported_by uuid,reported_at timestamptz default now(),answer text,answered_at timestamptz,channel text,judgment text,reason text,judged_at timestamptz,judged_by text);
    CREATE TABLE pg_consultation_evidence(question_id uuid,key text,user_id uuid,observed_at timestamptz);
    CREATE TABLE pg_consultation_events(review_id uuid,key text,detail text,at timestamptz default now(),primary key(review_id,key));
    CREATE TABLE pg_consultation_corrections(id uuid primary key,pg_id uuid,manager_id uuid,case_ids uuid[],body text,confirmed_by text,confirmed_at timestamptz default now(),fingerprint text,unique(pg_id,fingerprint));
    CREATE TABLE outbox_entries(event text,to_addr text,subject text,html text,dedupe_key text unique,status text default 'pending',sent_at timestamptz,last_error text);
    CREATE TABLE admin_audit_logs(id uuid default gen_random_uuid(),actor text,action text,entity_type text,entity_id uuid,payload_json jsonb,occurred_at timestamptz default now());
  `);
  await client.query("insert into workspaces(id,name)values($1,'시범PG'),($2,'다른PG')", [pg, other]);
  await client.query(
    "insert into users(id,name,email)values($1,'책임자','manager@example.test'),($2,'담당자','rep@example.test')",
    [manager, rep],
  );
  await client.query('insert into workspace_members(user_id,workspace_id)values($1,$3),($2,$3)', [
    manager,
    rep,
    pg,
  ]);
  await savePolicy(db, actor, pg, {
    enabled: true,
    alimtalkReady: false,
    managerId: manager,
    contactDays: 2,
    windowDays: 30,
    threshold: 2,
    roster: [{ userId: rep, groupId: null, size: '50m' }],
  });
});
afterEach(() => client.close());
async function seedCase(code: string, company = pg, disputed = false, late = true) {
  const rfp = randomUUID(),
    review = randomUUID();
  await client.query('insert into rfps(id,code)values($1,$2)', [rfp, code]);
  await client.query('insert into rfp_pg_reviews(id,rfp_id,pg_workspace_id)values($1,$2,$3)', [
    review,
    rfp,
    company,
  ]);
  await client.query('insert into pg_consultation_cases(review_id)values($1)', [review]);
  await client.query(
    'insert into pg_consultation_progress(review_id,disputed,contact_late)values($1,$2,$3)',
    [review, disputed, late],
  );
  return review;
}
it('미배정의 같은 PG 담당자를 변경하고 최초 기한, 배정 차수와 판정 이력을 보존한다', async () => {
  const review = await seedCase('A-1');
  const [before] = await operationsQueue(db);
  expect((await policyFor(db, pg)).roster[0].userId).toBe(rep);
  await expect(reassign(db, actor, review, randomUUID(), 1, '자의적 배정')).rejects.toThrow();
  await reassign(db, actor, review, rep, 1, '부재 대체');
  await expect(reassign(db, actor, review, manager, 1, '이중 요청')).rejects.toThrow();
  expect((await operationsQueue(db))[0]).toMatchObject({
    assignee: rep,
    revision: 2,
    contact_due: before.contact_due,
  });
  const q = randomUUID();
  await client.query(
    "insert into pg_consultation_questions(id,review_id,reported_by,answer)values($1,$2,$3,'missed')",
    [q, review, rep],
  );
  await adjudicate(db, actor, review, q, 'absent', '구매사가 첫 안내를 받지 못했다고 확인');
  await expect(adjudicate(db, actor, review, q, 'accepted', '중복 판정')).rejects.toThrow();
  const history = await caseHistory(db, review);
  expect(history.events).toHaveLength(1);
  expect(history.questions[0]).toMatchObject({ judgment: 'absent', judged_by: actor });
  gate.denied = true;
  await expect(setAssignee(review, { status: 'idle' }, new FormData())).rejects.toThrow(
    'PermissionDenied',
  );
});
it('기간 내 확정된 동일 PG 상담만 합의 건수에 포함하고 운영자 확정 한 번에 메일 한 통을 예약한다', async () => {
  const first = await seedCase('P-FIRST');
  await seedCase('OTHER', other);
  await seedCase('OPEN-DISPUTE', pg, true);
  await seedCase('ON-TIME', pg, false, false);
  const old = await seedCase('OLD');
  await client.query(
    "update pg_consultation_cases set contact_due=now()-interval '60 days' where review_id=$1",
    [old],
  );
  expect(await correctionDraft(db, pg)).toBeNull();
  const second = await seedCase('P-SECOND');
  const draft = (await correctionDraft(db, pg))!;
  expect([...draft.caseIds].sort()).toEqual([first, second].sort());
  expect(draft.body).toContain('미처리');
  expect(await corrections(db, pg)).toEqual([]);
  await expect(confirmCorrection(db, actor, pg, 'stale')).rejects.toThrow();
  await confirmCorrection(db, actor, pg, draft.fingerprint);
  await expect(confirmCorrection(db, actor, pg, draft.fingerprint)).rejects.toThrow();
  expect(await corrections(db, pg)).toEqual([
    expect.objectContaining({
      manager: '책임자',
      confirmed_by: actor,
      status: 'pending',
      body: draft.body,
    }),
  ]);
  expect((await client.query('select event,to_addr from outbox_entries')).rows).toEqual([
    { event: 'rfp.consultation', to_addr: 'manager@example.test' },
  ]);
  expect(await correctionDraft(db, pg)).toBeNull();

  await client.exec("update outbox_entries set status='failed',last_error='UNKNOWN_DELIVERY'");
  expect(await correctionDraft(db, pg)).toBeNull();
  await client.exec("update outbox_entries set last_error='RECIPIENT_CHANGED'");
  const retry = (await correctionDraft(db, pg))!;
  expect(retry.caseIds).toEqual(draft.caseIds);
  expect(retry.fingerprint).not.toBe(draft.fingerprint);
  await client.query('update pg_assignment_policies set manager_id=$1 where pg_id=$2', [rep, pg]);
  await expect(confirmCorrection(db, actor, pg, retry.fingerprint)).rejects.toThrow();
  const addressed = (await correctionDraft(db, pg))!;
  await confirmCorrection(db, actor, pg, addressed.fingerprint);
  expect(
    (await client.query('select to_addr,status from outbox_entries order by to_addr')).rows,
  ).toEqual([
    { to_addr: 'manager@example.test', status: 'failed' },
    { to_addr: 'rep@example.test', status: 'pending' },
  ]);
  expect(await correctionDraft(db, pg)).toBeNull();
});
