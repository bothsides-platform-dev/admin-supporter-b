import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { afterEach, beforeEach, expect, it } from 'vitest';
import type { DB } from '@/lib/db';
import { MERCHANT_TIERS } from '@/lib/types/bid';
import {
  channelTag,
  configOptions,
  correctCase,
  publishedPoliciesAcceptRates,
  listCases,
  saveConfig,
  stopChannel,
  type Config,
} from '../instant-quotes';
import { readPolicyForm, validStandards } from '@/lib/instant-quote-policy';

let client: PGlite, db: DB, pg: string, group: string;
const standards = [
  ...MERCHANT_TIERS.map((t) => ({ key: 'card:' + t, rate: 0.014 })),
  { key: 'virtual_account', rate: 300 },
];
const actor = { adminId: 'operator@example.test', adminUserId: randomUUID() };
beforeEach(async () => {
  client = new PGlite();
  db = drizzle(client, { casing: 'snake_case' }) as unknown as DB;
  pg = randomUUID();
  group = randomUUID();
  await client.exec(`
    create table workspaces(id uuid primary key,name text,type text,status text);
    create table pg_recommendation_groups(id uuid primary key,name text);
    create table pg_matching_policies(group_id uuid primary key,policy jsonb);
    create table pg_agreement_rates(pg_ws_id uuid primary key,rates jsonb);
    create table instant_pg_channels(pg_id uuid primary key, enabled boolean, recipient text, signup_url text, revision int default 1);
    create table instant_policies(group_id uuid, pg_id uuid, version int, policy jsonb, primary key(group_id,pg_id));
    create table instant_attempts(id uuid primary key,code text,terms jsonb, applicant jsonb, recipient text, consent_at timestamptz default now(), ack_due timestamptz,apply_due timestamptz,result_due timestamptz, ack_at timestamptz,applied_at timestamptz,result_at timestamptz,closed_at timestamptz,buyer_enrolled_at timestamptz,tier text, decision text, differs boolean,reported text,resolution text,correction_requested_at timestamptz,correction_requested_by uuid,resolved_at timestamptz,resolved_by uuid);
    create table signing_contracts(id uuid,status text,instant_attempt_id uuid);
    create table outbox_entries(event text,to_addr text,subject text,html text,dedupe_key text unique,status text default 'pending',sent_at timestamptz);
    create table admin_audit_logs(id uuid default gen_random_uuid(),actor text,action text,entity_type text,entity_id uuid,payload_json jsonb,occurred_at timestamptz default now());
  `);
  await client.query(
    "insert into workspaces values($1,'나래결제','pg','active')",
    [pg],
  );
  await client.query("insert into pg_recommendation_groups values($1,'의류')", [
    group,
  ]);
  await client.query('insert into pg_matching_policies values($1,$2)', [
    group,
    JSON.stringify({ risk: 'white', candidates: [{ pgWorkspaceId: pg }] }),
  ]);
  await client.query('insert into pg_agreement_rates values($1,$2)', [
    pg,
    JSON.stringify(standards),
  ]);
});
afterEach(() => client.close());
function form(c: Config) {
  const f = new FormData();
  const fields = {
    recipient: 'partner@example.test',
    url: 'https://partner.example.test/signup',
    version: String(c.version ?? 0),
    revision: String(c.revision ?? 0),
    channelTag: channelTag(c),
    enabled: 'on',
    verified: 'on',
    insurance: 'none',
    limit: 'negotiable',
    signupFee: 'fixed',
    'signupFee.won': '0',
    cycle: '3',
    'cycle.unit': 'business',
    responseDays: '30',
    validityDays: '5',
    retryDays: '10',
    ackDays: '1',
    applicationDays: '3',
    resultDays: '7',
    'rate:virtual_account': '250',
  };
  for (const [key, value] of Object.entries(fields)) f.set(key, value);
  for (const t of MERCHANT_TIERS)
    f.set('rate:card:' + t, t === 'sole' ? '0' : '1.2');
  return f;
}
it('모든 등급의 판가·약정, 기한과 수신처 검증 뒤 게시하고 오래된 판본의 덮어쓰기를 막는다', async () => {
  const [initial] = await configOptions(db),
    f = form(initial);
  const policy = readPolicyForm(f)!;
  expect(policy.fees).toEqual(
    expect.arrayContaining([
      { key: 'card:sole', rate: 0 },
      { key: 'card:sme1', rate: 0.012 },
      { key: 'virtual_account', rate: 250 },
    ]),
  );
  expect(validStandards(policy, standards.slice(1))).toBe(false);
  expect(
    validStandards(
      policy,
      standards.map((s) => ({ ...s, rate: 0 })),
    ),
  ).toBe(false);
  f.set('responseDays', '7');
  expect(await saveConfig(db, actor.adminId, pg, group, f)).toBe(false);
  f.set('responseDays', '30');
  f.delete('rate:card:sme1');
  expect(await saveConfig(db, actor.adminId, pg, group, f)).toBe(false);
  f.set('rate:card:sme1', '1.2');
  expect(await saveConfig(db, actor.adminId, pg, group, f)).toBe(true);
  expect(await saveConfig(db, actor.adminId, pg, group, f)).toBe(false);
  const [published] = await configOptions(db);
  expect(published).toMatchObject({ version: 1, revision: 1, enabled: true });
  expect(await publishedPoliciesAcceptRates(db, pg, standards.slice(1))).toBe(
    false,
  );
  expect(await publishedPoliciesAcceptRates(db, pg, standards)).toBe(true);
  const rotated = form(published);
  rotated.set('recipient', 'second@example.test');
  expect(await saveConfig(db, actor.adminId, pg, group, rotated)).toBe(true);
  await stopChannel(db, actor.adminId, pg);
  expect(await publishedPoliciesAcceptRates(db, pg, [])).toBe(true);
  expect((await configOptions(db))[0]).toMatchObject({
    version: 2,
    revision: 2,
    enabled: false,
    recipient: 'second@example.test',
  });
});
it('수신 지연·외부 접수와 합의서 상태를 구분하고 한 번만 정정 요청 후 결과를 기록한다', async () => {
  const id = randomUUID();
  await client.query(
    `insert into instant_attempts(id,code,terms,applicant,recipient,ack_due,apply_due,result_due) values($1,'Q-1','{"pgName":"나래결제"}','{"company":"구매사"}','partner@example.test',now(),now(),now())`,
    [id],
  );
  expect((await listCases(db))[0]).toMatchObject({
    stage: '외부 접수 확인 전',
    unacknowledged: true,
    missing_application: true,
    awaiting_result: true,
  });
  await client.query(
    'update instant_attempts set buyer_enrolled_at=now() where id=$1',
    [id],
  );
  expect((await listCases(db))[0]).toMatchObject({
    stage: '합의서 미시작',
    awaiting_result: true,
    missing_application: true,
  });
  await client.query(
    "insert into signing_contracts values($1,'awaiting_pg_template',$2)",
    [randomUUID(), id],
  );
  expect((await listCases(db))[0].stage).toBe('합의서 미서명');
  await client.query(
    "update instant_attempts set differs=true,reported='계약 수수료 차이',tier='sole' where id=$1",
    [id],
  );
  expect((await listCases(db))[0]).toMatchObject({
    stage: '조건 불일치',
    unsigned: true,
  });
  for (let i = 0; i < 2; i++)
    expect(
      await correctCase(db, actor, id, 'request', '영세 등급 수수료 확인'),
    ).toBe(true);
  expect(
    (await client.query('select dedupe_key,to_addr from outbox_entries')).rows,
  ).toEqual([
    {
      dedupe_key: 'instant:' + id + ':pg:correct',
      to_addr: 'partner@example.test',
    },
  ]);
  expect(
    await correctCase(db, actor, id, 'resolve', '약정 수수료로 소급 정정'),
  ).toBe(true);
  expect((await listCases(db))[0]).toMatchObject({
    stage: '정정 완료',
    resolution: '약정 수수료로 소급 정정',
  });
  await client.query(
    'update instant_attempts set closed_at=now() where id=$1',
    [id],
  );
  expect(await listCases(db)).toHaveLength(0);
  expect((await listCases(db, 'q-1'))[0].stage).toBe('종료된 회차');
  expect(
    (await client.query('select actor from admin_audit_logs')).rows,
  ).toHaveLength(2);
});
