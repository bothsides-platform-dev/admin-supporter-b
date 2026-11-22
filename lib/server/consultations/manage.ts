import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import type { DB } from '@/lib/db';
import { adminAuditLogs } from '@/lib/db/schema';
import { activeMembers, correctionDraft, groups, policyFor, rows } from './queries';

export const policyInput = z.object({
  enabled: z.boolean(),
  alimtalkReady: z.boolean(),
  managerId: z.uuid(),
  contactDays: z.number().int().min(1).max(30),
  windowDays: z.number().int().positive().max(2147483647),
  threshold: z.number().int().positive().max(2147483647),
  roster: z.array(
    z.object({
      userId: z.uuid(),
      groupId: z.uuid().nullable(),
      size: z.enum(['50m', '100m']).nullable(),
    }),
  ),
});
type Tx = Parameters<Parameters<DB['transaction']>[0]>[0];
export class ConsultationConflict extends Error {}
function requireState(value: unknown, message: string): asserts value {
  if (!value) throw new ConsultationConflict(message);
}
function audit(
  tx: Tx,
  actor: string,
  action: string,
  entityType: string,
  entityId: string,
  payloadJson: Record<string, unknown>,
) {
  return tx.insert(adminAuditLogs).values({ actor, action, entityType, entityId, payloadJson });
}
async function lockPg(tx: Tx, pgId: string) {
  const found = await rows(
    tx,
    sql`select id from workspaces where id=${pgId} and type='pg' for update`,
  );
  requireState(found.length, 'PG사를 찾을 수 없습니다.');
}
async function lockCase(tx: Tx, reviewId: string) {
  const [rfp] = await rows<{ id: string }>(
    tx,
    sql`select f.id from rfps f join rfp_pg_reviews r on r.rfp_id=f.id
    join pg_consultation_cases c on c.review_id=r.id where r.id=${reviewId} for update of f`,
  );
  requireState(rfp, '상담을 찾을 수 없습니다.');
  const [c] = await rows<{ assignee: string | null; revision: number; pg_id: string; active: boolean }>(
    tx,
    sql`
    select c.assignee,c.revision,r.pg_workspace_id pg_id,r.status in ('requested','reviewing','quoted') and f.status='sent' active
    from pg_consultation_cases c join rfp_pg_reviews r on r.id=c.review_id join rfps f on f.id=r.rfp_id where c.review_id=${reviewId}`,
  );
  return { ...c, rfpId: rfp.id };
}
export async function savePolicy(
  db: DB,
  actor: string,
  pgId: string,
  input: z.infer<typeof policyInput>,
) {
  await db.transaction(async (tx) => {
    await lockPg(tx, pgId);
    const [members, industries, old] = await Promise.all([
      activeMembers(tx, pgId),
      groups(tx),
      policyFor(tx, pgId),
    ]);
    requireState(
      members.some((m) => m.id === input.managerId),
      '현재 승인된 PG 책임자를 선택해 주세요.',
    );
    for (const r of input.roster) {
      requireState(
        members.some((m) => m.id === r.userId) &&
          (!r.groupId || industries.some((g) => g.id === r.groupId)),
        '담당자 또는 업종이 변경되었습니다. 명단을 다시 확인해 주세요.',
      );
    }
    const roster = JSON.stringify(input.roster);
    await tx.execute(sql`insert into pg_assignment_policies(pg_id,enabled,alimtalk_ready,contact_days,window_days,threshold,manager_id,roster)
      values(${pgId},${input.enabled},${input.alimtalkReady},${input.contactDays},${input.windowDays},${input.threshold},${input.managerId},${roster}::jsonb)
      on conflict(pg_id) do update set enabled=excluded.enabled,alimtalk_ready=excluded.alimtalk_ready,contact_days=excluded.contact_days,
      window_days=excluded.window_days,threshold=excluded.threshold,manager_id=excluded.manager_id,roster=excluded.roster`);
    await audit(tx, actor, 'consultation.policy', 'workspace', pgId, { before: old, after: input });
  });
}
export async function reassign(
  db: DB,
  actor: string,
  reviewId: string,
  userId: string,
  expectedRevision: number,
  reason: string,
) {
  return db.transaction(async (tx) => {
    const c = await lockCase(tx, reviewId);
    requireState(
      c.active && c.revision === expectedRevision,
      '상담 상태나 배정이 바뀌었습니다. 새로고침해 주세요.',
    );
    requireState(
      c.assignee !== userId && (await activeMembers(tx, c.pg_id)).some((m) => m.id === userId),
      '다른 활성·승인 담당자를 선택해 주세요.',
    );
    await tx.execute(
      sql`update pg_consultation_cases set assignee=${userId},revision=revision+1 where review_id=${reviewId}`,
    );
    await tx.execute(
      sql`insert into pg_consultation_events(review_id,key,detail) values(${reviewId},${'assignment-' + (c.revision + 1)},${userId})`,
    );
    await audit(tx, actor, 'consultation.assign', 'rfp', c.rfpId, {
      reviewId,
      before: { assignee: c.assignee },
      after: { assignee: userId },
      reason,
    });
    return c.rfpId;
  });
}
export async function adjudicate(
  db: DB,
  actor: string,
  reviewId: string,
  questionId: string,
  judgment: 'accepted' | 'absent',
  reason: string,
) {
  return db.transaction(async (tx) => {
    const c = await lockCase(tx, reviewId);
    const changed = await rows(
      tx,
      sql`update pg_consultation_questions set judgment=${judgment},reason=${reason},judged_by=${actor},judged_at=clock_timestamp()
      where id=${questionId} and review_id=${reviewId} and answer='missed' and judgment is null returning id`,
    );
    requireState(changed.length, '이미 판정했거나 미수신 응답이 없는 질문입니다.');
    await audit(tx, actor, 'consultation.judge', 'rfp', c.rfpId, {
      reviewId,
      questionId,
      judgment,
      reason,
    });
    return c.rfpId;
  });
}
export async function confirmCorrection(db: DB, actor: string, pgId: string, fingerprint: string) {
  return db.transaction(async (tx) => {
    await lockPg(tx, pgId);
    const preview = await correctionDraft(tx, pgId);
    requireState(
      preview && preview.fingerprint === fingerprint,
      '집계나 책임자가 바뀌었습니다. 최신 초안을 확인해 주세요.',
    );
    const ids = sql.join(
      preview.rfpIds.map((id) => sql`${id}::uuid`),
      sql`,`,
    );
    await tx.execute(sql`select id from rfps where id in (${ids}) order by id for update`);
    const draft = await correctionDraft(tx, pgId);
    requireState(
      draft && draft.fingerprint === fingerprint,
      '연락 기록이 바뀌었습니다. 최신 초안을 확인해 주세요.',
    );
    const id = randomUUID();
    const caseIds = sql.join(
      draft.caseIds.map((cid) => sql`${cid}::uuid`),
      sql`,`,
    );
    await tx.execute(sql`insert into pg_consultation_corrections(id,pg_id,manager_id,case_ids,body,confirmed_by,fingerprint)
      values(${id},${pgId},${draft.manager.id},array[${caseIds}],${draft.body},${actor},${fingerprint})`);
    const html =
      '<p>' +
      draft.body
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('\n', '<br>') +
      '</p>';
    await tx.execute(sql`insert into outbox_entries(event,to_addr,subject,html,dedupe_key)
      values('rfp.consultation',${draft.manager.email},${draft.subject},${html},${JSON.stringify(['correction', id])})`);
    await audit(tx, actor, 'consultation.correction', 'workspace', pgId, {
      noticeId: id,
      managerId: draft.manager.id,
      caseIds: draft.caseIds,
    });
  });
}
