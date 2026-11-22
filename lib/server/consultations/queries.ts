import { createHash } from 'node:crypto';
import { sql, type SQL } from 'drizzle-orm';
import type { DB } from '@/lib/db';

export type Reader = Pick<DB, 'execute'>;
export type RosterRule = { userId: string; groupId: string | null; size: '50m' | '100m' | null };
export type Policy = {
  pg_id: string;
  enabled: boolean;
  alimtalk_ready: boolean;
  manager_id: string;
  contact_days: number;
  window_days: number;
  threshold: number;
  roster: RosterRule[];
};
export type Option = { id: string; name: string };
export type Member = Option & { email: string };
export type CaseRow = {
  review_id: string;
  rfp_id: string;
  code: string;
  pg_id: string;
  pg_name: string;
  assignee: string | null;
  assignee_name: string | null;
  revision: number;
  status: string;
  active: boolean;
  contact_due: string;
  quote_due: string;
  late_quote_due: string | null;
  quoted_at: string | null;
  first_contact_at: string | null;
  contact_late: boolean;
  quote_late: boolean;
  disputed: boolean;
  consent_at: string;
  consent_text: string;
};
type QuestionRow = {
  id: string;
  reported_at: string;
  reporter: string;
  answer: 'received' | 'missed' | null;
  answered_at: string | null;
  channel: string | null;
  judgment: string | null;
  reason: string | null;
  judged_by: string | null;
  judged_at: string | null;
};
type RecordRow = { key: string; at: string; detail: string };
type CorrectionRow = {
  id: string;
  body: string;
  manager: string;
  confirmed_by: string;
  confirmed_at: string;
  status: string;
  sent_at: string | null;
  last_error: string | null;
};

export async function rows<T extends Record<string, unknown>>(db: Reader, query: SQL): Promise<T[]> {
  const result = await db.execute<T>(query);
  // postgres-js returns a row list. The embedded Postgres used in tests returns {rows}.
  return Array.isArray(result) ? (Array.from(result) as T[]) : (result as { rows: T[] }).rows;
}

export function activeMembers(db: Reader, pgId: string) {
  return rows<Member>(
    db,
    sql`select u.id,u.name,u.email from users u join workspace_members m on m.user_id=u.id
    join workspaces w on w.id=m.workspace_id where w.id=${pgId} and w.status='active' and w.type='pg'
    and u.status='active' and u.email_verified and u.deleted_at is null and m.approval_status='approved' order by u.name,u.id`,
  );
}
export function groups(db: Reader) {
  return rows<Option>(db, sql`select id,name from pg_recommendation_groups order by sort_order,name`);
}
export function companies(db: Reader) {
  return rows<Option & { enabled: boolean }>(
    db,
    sql`select w.id,w.name,coalesce(p.enabled,false) enabled from workspaces w
    left join pg_assignment_policies p on p.pg_id=w.id where w.type='pg' and (w.status='active' or p.pg_id is not null) order by w.name`,
  );
}
export async function policyFor(db: Reader, pgId: string) {
  return (await rows<Policy>(db, sql`select * from pg_assignment_policies where pg_id=${pgId}`))[0];
}
const caseQuery = sql`select c.review_id,r.rfp_id,f.code,r.pg_workspace_id pg_id,w.name pg_name,
 c.assignee,u.name assignee_name,c.revision,r.status,r.status in ('requested','reviewing','quoted') and f.status='sent' active,
 c.contact_due,c.quote_due,c.late_quote_due,c.quoted_at,p.first_contact_at,p.contact_late,p.quote_late,p.disputed,c.consent_at,c.consent_text
 from pg_consultation_cases c join pg_consultation_progress p using(review_id) join rfp_pg_reviews r on r.id=c.review_id
 join rfps f on f.id=r.rfp_id join workspaces w on w.id=r.pg_workspace_id left join users u on u.id=c.assignee`;

export function operationsQueue(db: Reader) {
  return rows<CaseRow>(
    db,
    sql`${caseQuery} where p.contact_late or p.quote_late or p.disputed
    or (c.assignee is null and r.status in ('requested','reviewing','quoted') and f.status='sent') order by c.contact_due,c.review_id`,
  );
}
export function requestCases(db: Reader, rfpId: string) {
  return rows<CaseRow>(db, sql`${caseQuery} where f.id=${rfpId} order by r.created_at,c.review_id`);
}
export async function caseHistory(db: Reader, reviewId: string) {
  const [questions, events, evidence] = await Promise.all([
    rows<QuestionRow>(
      db,
      sql`select q.id,q.reported_at,u.name reporter,q.answer,q.answered_at,q.channel,q.judgment,q.reason,q.judged_by,q.judged_at
      from pg_consultation_questions q join users u on u.id=q.reported_by where q.review_id=${reviewId} order by q.reported_at`,
    ),
    rows<RecordRow>(
      db,
      sql`select e.key,e.at,coalesce(u.name,e.detail) detail from pg_consultation_events e left join users u on e.detail=u.id::text
      where e.review_id=${reviewId} order by e.at`,
    ),
    rows<RecordRow>(
      db,
      sql`select e.key,e.observed_at at,u.name detail from pg_consultation_evidence e join pg_consultation_questions q on q.id=e.question_id
      join users u on u.id=e.user_id where q.review_id=${reviewId} order by e.observed_at`,
    ),
  ]);
  return { questions, events, evidence };
}
export function corrections(db: Reader, pgId: string) {
  return rows<CorrectionRow>(
    db,
    sql`select c.id,c.body,u.name manager,c.confirmed_by,c.confirmed_at,o.status,o.sent_at,o.last_error
    from pg_consultation_corrections c join users u on u.id=c.manager_id join outbox_entries o on o.dedupe_key='["correction","'||c.id::text||'"]'
    where c.pg_id=${pgId} order by c.confirmed_at desc`,
  );
}

export const formatTime = (date: string | Date | null) =>
  date
    ? new Intl.DateTimeFormat('ko-KR', {
        timeZone: 'Asia/Seoul',
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(date))
    : '미처리';

export async function correctionDraft(db: Reader, pgId: string) {
  const policy = await policyFor(db, pgId);
  if (!policy) return null;
  const manager = (await activeMembers(db, pgId)).find((m) => m.id === policy.manager_id);
  if (!manager) return null;
  const since = sql`now() - ${policy.window_days} * interval '1 day'`;
  const cases = await rows<CaseRow>(
    db,
    sql`${caseQuery} where r.pg_workspace_id=${pgId} and not p.disputed
    and ((p.contact_late and c.contact_due >= ${since}) or (p.quote_late and coalesce(c.late_quote_due,c.quote_due) >= ${since}))
    and not exists(
      select 1 from pg_consultation_corrections n
      left join outbox_entries o on o.dedupe_key='["correction","'||n.id::text||'"]'
      where n.pg_id=${pgId} and c.review_id=any(n.case_ids)
        and (o.status='failed' and o.last_error='RECIPIENT_CHANGED') is not true
    )
    order by r.rfp_id,c.review_id`,
  );
  if (cases.length < policy.threshold) return null;
  const details = cases.map((c) => {
    const lines = [c.code];
    if (c.contact_late)
      lines.push(
        '첫 연락 약속 ' + formatTime(c.contact_due) + ' / 실제 ' + formatTime(c.first_contact_at),
      );
    if (c.quote_late)
      lines.push(
        '견적 마감 ' +
          formatTime(c.late_quote_due ?? c.quote_due) +
          ' / 실제 ' +
          formatTime(c.quoted_at),
      );
    return lines.join('\n');
  });
  const subject = cases[0].pg_name + ' 상담 지연 시정 요청';
  const body = [
    manager.name + ' 책임자님께',
    '최근 ' +
      policy.window_days +
      '일 동안 합의한 처리 기한을 넘긴 상담이 ' +
      cases.length +
      '건입니다. 아래 건의 처리 결과와 재발 방지 계획을 회신해 주세요.',
    ...details,
  ].join('\n\n');
  const caseIds = cases.map((c) => c.review_id);
  // A definitive pre-send rejection can be confirmed again. Include previous attempts so
  // reapproval works even if the manager returns to the same address.
  const ids = sql.join(
    caseIds.map((id) => sql`${id}::uuid`),
    sql`,`,
  );
  const rejected = await rows<{ id: string }>(
    db,
    sql`
    select n.id from pg_consultation_corrections n
    join outbox_entries o on o.dedupe_key='["correction","'||n.id::text||'"]'
    where n.pg_id=${pgId} and n.case_ids && array[${ids}]
      and o.status='failed' and o.last_error='RECIPIENT_CHANGED' order by n.id
  `,
  );
  const fingerprint = createHash('sha256')
    .update(
      JSON.stringify([
        manager.id,
        manager.email,
        policy.threshold,
        body,
        caseIds,
        rejected.map((n) => n.id),
      ]),
    )
    .digest('hex');
  return { manager, subject, body, caseIds, rfpIds: cases.map((c) => c.rfp_id), fingerprint };
}
