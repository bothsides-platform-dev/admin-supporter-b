import { sql } from 'drizzle-orm';
import { z } from 'zod';
import type { DB } from '@/lib/db';
import { adminAuditLogs } from '@/lib/db/schema';
import { rows, type Reader } from './consultations/queries';
import {
  readPolicyForm,
  policySchema,
  validStandards,
  type Policy,
} from '@/lib/instant-quote-policy';
import type { AgreementRate } from '@/lib/agreement-rates';

export type Config = {
  pg_id: string;
  group_id: string;
  pg: string;
  industry: string;
  candidate: { feesByTier?: Record<string, number | null> };
  policy: Policy | null;
  version: number | null;
  revision: number | null;
  recipient: string | null;
  signup_url: string | null;
  enabled: boolean | null;
  rates: AgreementRate[] | null;
};
export function configOptions(db: Reader) {
  return rows<Config>(
    db,
    sql`select w.id as pg_id,g.id as group_id,w.name as pg,g.name as industry,c as candidate,
 ip.policy,ip.version,ch.revision,ch.recipient,ch.signup_url,ch.enabled,ar.rates from pg_matching_policies mp
 join pg_recommendation_groups g on g.id=mp.group_id cross join lateral jsonb_array_elements(case when jsonb_typeof(mp.policy->'candidates')='array' then mp.policy->'candidates' else '[]'::jsonb end) with ordinality cand(c,ord)
 join workspaces w on w.id::text=c->>'pgWorkspaceId' and w.type='pg' and w.status='active'
 left join instant_pg_channels ch on ch.pg_id=w.id left join instant_policies ip on ip.pg_id=w.id and ip.group_id=g.id
 left join pg_agreement_rates ar on ar.pg_ws_id=w.id where mp.policy->>'risk'='white' order by g.name,ord`,
  );
}
export const channelTag = (c: Config) =>
  JSON.stringify([c.recipient, c.signup_url, c.enabled]);
export async function stopChannel(db: DB, actor: string, pg: string) {
  if (!z.uuid().safeParse(pg).success) return;
  await db.transaction(async (tx) => {
    await tx.execute(
      sql`update instant_pg_channels set enabled=false where pg_id=${pg}`,
    );
    await tx.insert(adminAuditLogs).values({
      actor,
      action: 'pg.instant_paused',
      entityType: 'workspace',
      entityId: pg,
      payloadJson: {},
    });
  });
}
export async function saveConfig(
  db: DB,
  actor: string,
  pg: string,
  group: string,
  f: FormData,
) {
  if (!z.uuid().safeParse(pg).success || !z.uuid().safeParse(group).success)
    return false;
  const email = z.email().safeParse(
      String(f.get('recipient') ?? '')
        .trim()
        .toLowerCase(),
    ),
    url = z.url().safeParse(f.get('url'));
  if (!email.success || !url.success) return false;
  const link = new URL(url.data);
  if (
    link.protocol !== 'https:' ||
    link.username ||
    link.password ||
    link.search ||
    link.hash
  )
    return false;
  return db.transaction(async (tx) => {
    await tx.execute(sql`select id from workspaces where id=${pg} for update`);
    await tx.execute(
      sql`select group_id from pg_matching_policies where group_id=${group} for share`,
    );
    await tx.execute(
      sql`select pg_ws_id from pg_agreement_rates where pg_ws_id=${pg} for share`,
    );
    const current = (await configOptions(tx)).find(
      (r) => r.pg_id === pg && r.group_id === group,
    );
    if (
      !current ||
      f.get('channelTag') !== channelTag(current) ||
      Number(f.get('version')) !== (current.version ?? 0) ||
      Number(f.get('revision')) !== (current.revision ?? 0)
    )
      return false;
    const policy = readPolicyForm(f, current.policy?.fees),
      enabled = f.has('enabled');
    if (
      !policy ||
      !validStandards(policy, current.rates) ||
      (enabled && !f.has('verified'))
    )
      return false;
    await tx.execute(sql`insert into instant_pg_channels(pg_id,recipient,signup_url,enabled) values(${pg},${email.data},${link.href},${enabled})
    on conflict(pg_id) do update set recipient=excluded.recipient,signup_url=excluded.signup_url,enabled=excluded.enabled,
    revision=instant_pg_channels.revision+case when instant_pg_channels.recipient<>excluded.recipient then 1 else 0 end`);
    await tx.execute(sql`insert into instant_policies(group_id,pg_id,version,policy) values(${group},${pg},1,${JSON.stringify(policy)}::jsonb)
    on conflict(group_id,pg_id) do update set policy=excluded.policy,version=instant_policies.version+1`);
    await tx.insert(adminAuditLogs).values({
      actor,
      action: 'pg.instant_policy_saved',
      entityType: 'workspace',
      entityId: pg,
      payloadJson: {
        groupId: group,
        version: (current.version ?? 0) + 1,
        enabled,
        recipientChanged: current.recipient !== email.data,
      },
    });
    return true;
  });
}
export async function publishedPoliciesAcceptRates(
  db: Reader,
  pg: string,
  rates: AgreementRate[],
) {
  const policies = await rows<{ policy: unknown }>(
    db,
    sql`select p.policy from instant_policies p join instant_pg_channels c on c.pg_id=p.pg_id where c.enabled=true and p.pg_id=${pg}`,
  );
  return policies.every((row) => {
    const p = policySchema.safeParse(row.policy);
    return p.success && validStandards(p.data, rates);
  });
}
export type CaseRow = {
  id: string;
  code: string;
  pg: string;
  company: string;
  stage: string;
  applied_at: string | null;
  decision: string | null;
  reported: string | null;
  tier: string | null;
  terms: { policy: Policy; policyVersion: number; rateVersion: number };
  resolution: string | null;
  correction_requested_at: string | null;
  mail_status: string | null;
  sent_at: string | null;
  ack_at: string | null;
  unacknowledged: boolean;
  missing_application: boolean;
  awaiting_result: boolean;
  agreement_not_started: boolean;
  unsigned: boolean;
  result_at: string | null;
  recipient: string;
};
export function listCases(db: Reader, code?: string) {
  return rows<CaseRow>(
    db,
    sql`select a.id,a.code,a.terms->>'pgName' as pg,a.applicant->>'company' as company,a.applied_at,a.decision,a.result_at,a.recipient,a.reported,a.tier,a.terms,a.resolution,a.correction_requested_at,m.status as mail_status,m.sent_at,a.ack_at,
 a.closed_at is null and a.ack_at is null and a.ack_due<=now() as unacknowledged,a.applied_at is null and a.apply_due<=now() and a.result_at is null as missing_application,
 a.result_at is null and a.result_due<=now() as awaiting_result,
 (a.buyer_enrolled_at is not null or a.decision is not distinct from 'approved') and s.id is null as agreement_not_started,
 s.id is not null and s.status<>'completed' as unsigned,
 case when a.closed_at is not null then '종료된 회차' when a.differs and a.resolved_at is null then '조건 불일치' when a.resolved_at is not null then '정정 완료' when s.status='completed' then '서명 완료'
 when s.id is not null then '합의서 미서명' when a.buyer_enrolled_at is not null or a.decision='approved' then '합의서 미시작'
 when a.decision='declined' then '가입 거절' when a.applied_at is not null then 'PG 심사 중' else '외부 접수 확인 전' end as stage
 from instant_attempts a left join outbox_entries m on m.dedupe_key=('instant:' || a.id::text || ':pg:issued') left join signing_contracts s on s.instant_attempt_id=a.id where ${code ? sql`a.code=${code.trim().toUpperCase()}` : sql`a.closed_at is null`} order by a.consent_at desc`,
  );
}
export async function correctCase(
  db: DB,
  actor: { adminUserId: string; adminId: string },
  id: string,
  act: string,
  note: string,
) {
  if (
    !z.uuid().safeParse(id).success ||
    !['request', 'resolve'].includes(act) ||
    !note.trim() ||
    note.length > 1500
  )
    return false;
  return db.transaction(async (tx) => {
    const [a] = await rows<{
      id: string;
      code: string;
      recipient: string;
      correction_requested_at: string | null;
    }>(
      tx,
      sql`select id,code,recipient,correction_requested_at from instant_attempts where id=${id} and differs=true and resolved_at is null for update`,
    );
    if (!a) return false;
    if (act === 'request') {
      if (a.correction_requested_at) return true;
      await tx.execute(
        sql`update instant_attempts set correction_requested_at=now(),correction_requested_by=${actor.adminUserId} where id=${id}`,
      );
      await tx.execute(
        sql`insert into outbox_entries(event,to_addr,subject,html,dedupe_key) values('pg.instant_quote',${a.recipient},${'[서포트비 ' + a.code + '] 적용 조건 정정 요청'},'',${'instant:' + id + ':pg:correct'}) on conflict do nothing`,
      );
    } else
      await tx.execute(
        sql`update instant_attempts set resolution=${note.trim()},resolved_at=now(),resolved_by=${actor.adminUserId} where id=${id}`,
      );
    await tx.insert(adminAuditLogs).values({
      actor: actor.adminId,
      action: 'pg.instant_correction_' + act,
      entityType: 'instant_attempt',
      entityId: id,
      payloadJson: { note: note.trim() },
    });
    return true;
  });
}
