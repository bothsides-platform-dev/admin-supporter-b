import { createHash } from 'node:crypto';
import { and, eq, isNotNull, or, isNull, lt, sql } from 'drizzle-orm';
import { Resend } from 'resend';
import { requireAdminPermission } from '@/lib/auth/admin-session';
import { adminAuditLogs, outboxEntries, rfps } from '@/lib/db/schema';
import type { DB } from '@/lib/db';

import { actionDb } from '@/lib/server/actions/auth/_shared';
import { formatKST, isUuid } from '@/lib/utils';

type ReadDb = DB | Parameters<Parameters<DB['transaction']>[0]>[0];
const EVENT = 'rfp.deadline_reminder';
const scope = (rfpId: string) =>
  and(eq(outboxEntries.event, EVENT), sql`split_part(${outboxEntries.dedupeKey},':',2)=${rfpId}`);

async function candidates(db: ReadDb, rfpId: string, lock = false) {
  const rows = await db.select({
    code: sql<string>`r.code`,
    pgId: sql<string>`w.id`,
    pg: sql<string>`w.name`,
    userId: sql<string>`u.id`,
    email: sql<string>`u.email`,
    review: sql<string | null>`p.review_id`,
    round: sql<number>`coalesce(q.round,1)`,
    deadline: sql<string>`coalesce(q.deadline,r.deadline)::text`,
  }).from(sql`rfps r join lateral (
    select i.pg_ws_id, null::uuid as review_id, i.expires_at from rfp_invitations i
    where i.rfp_id=r.id and i.status not in ('draft','expired')
      and not exists(select 1 from rfp_matching_requests m where m.rfp_id=r.id)
    union all select v.pg_ws_id,v.id,null from rfp_pg_reviews v
    where v.rfp_id=r.id and v.status in ('requested','reviewing','quoted')
      and not exists(select 1 from pg_consultation_cases c where c.review_id=v.id)
  ) p on true
  join workspaces w on w.id=p.pg_ws_id and w.type='pg' and w.status='active'
  join workspace_members wm on wm.workspace_id=w.id and wm.approval_status='approved'
  join users u on u.id=wm.user_id and u.status='active' and u.deleted_at is null and u.email_verified and u.password_hash <> '!'
  left join lateral (select q.round,q.deadline from rfp_requote_requests q where q.rfp_id=r.id
    and q.pg_ws_id=w.id and q.status='pending' order by q.round desc limit 1) q on true
  where r.id=${rfpId} and r.status='sent' and not exists(select 1 from contracts c where c.rfp_id=r.id)
    and coalesce(q.deadline,r.deadline)>clock_timestamp()
    and (q.round is not null or p.expires_at is null or p.expires_at>clock_timestamp())
    and not exists(select 1 from bids b where b.rfp_id=r.id and b.pg_ws_id=w.id and b.status='withdrawn')
    and not exists(select 1 from bids b where b.rfp_id=r.id and b.pg_ws_id=w.id and b.status='submitted'
      and (q.round is null or b.round=q.round))
  order by w.name,w.id,u.email,u.id ${lock ? sql`for share of wm,u,w` : sql.empty()}`);
  return rows.map((r) => {
    // Matches bidit's automatic deadline notification identity, including ISO milliseconds.
    const key = `reminder:${rfpId}:${r.pgId}:${r.review ?? 'legacy'}:${r.round}:${new Date(r.deadline).toISOString()}:${r.userId}:email`;
    return {
      ...r,
      key,
      token: createHash('sha256')
        .update(key + '|' + r.email)
        .digest('hex'),
    };
  });
}

export async function reminderPreview(id: string, db = actionDb()) {
  await requireAdminPermission('reminders.send');
  if (!isUuid(id)) return [];
  return candidates(db, id);
}

export async function reminderHistory(id: string, db = actionDb()) {
  await requireAdminPermission('data.view');
  if (!isUuid(id)) return [];
  return db
    .select({
      id: outboxEntries.id,
      key: outboxEntries.dedupeKey,
      status: outboxEntries.status,
      email: outboxEntries.toAddr,
      pg: sql<
        string | null
      >`(select w.name from workspaces w where w.id::text=split_part(${outboxEntries.dedupeKey},':',3))`,
      scheduledAt: outboxEntries.scheduledAt,
      sentAt: outboxEntries.sentAt,
      attempts: outboxEntries.attempts,
      messageId: outboxEntries.providerMessageId,
      event: outboxEntries.providerEvent,
      checkedAt: outboxEntries.providerCheckedAt,
    })
    .from(outboxEntries)
    .where(scope(id))
    .orderBy(sql`${outboxEntries.scheduledAt} desc, ${outboxEntries.id}`);
}

export async function enqueueReminders(id: string, selected: string[], reason: string, db = actionDb()) {
  const session = await requireAdminPermission('reminders.send');
  const tokens = new Set(selected);
  if (!isUuid(id) || !tokens.size || tokens.size > 500 || !reason.trim() || reason.trim().length > 500)
    return { ok: false as const, error: 'INVALID_INPUT' };
  return db.transaction(async (tx) => {
    const [rfp] = await tx.select({ id: rfps.id }).from(rfps).where(eq(rfps.id, id)).for('update');
    if (!rfp) return { ok: false as const, error: 'NOT_FOUND' };
    const chosen = (await candidates(tx, id, true)).filter((r) => tokens.has(r.token));
    if (chosen.length !== tokens.size) return { ok: false as const, error: 'RECIPIENTS_CHANGED' };
    const rows = chosen.map((r) => {
      const deadline = formatKST(r.deadline);
      const code = r.code.replace(/[<>&"']/g, '');
      const href = new URL(
        '/inbox/' + encodeURIComponent(r.code),
        process.env.NEXT_PUBLIC_PARTNER_ORIGIN || 'https://partner.support-b.com',
      ).href;
      return {
        event: EVENT as typeof EVENT,
        toAddr: r.email,
        dedupeKey: r.key,
        subject: `[서포트비] ${code} ${r.round}차 견적 마감 안내`,
        html: `<p>${code}의 ${r.round}차 견적 마감은 ${deadline}입니다.</p><p><a href="${href}">견적 요청 확인</a></p>`,
      };
    });
    const inserted = await tx
      .insert(outboxEntries)
      .values(rows)
      .onConflictDoNothing({ target: outboxEntries.dedupeKey, where: isNotNull(outboxEntries.dedupeKey) })
      .returning({ id: outboxEntries.id });
    if (inserted.length)
      await tx
        .insert(adminAuditLogs)
        .values({
          actor: session.adminId,
          action: 'reminder.enqueue',
          entityType: 'rfp',
          entityId: id,
          payloadJson: {
            reason: reason.trim(),
            after: { queued: inserted.length, outboxIds: inserted.map((r) => r.id) },
          },
        });
    return { ok: true as const, queued: inserted.length, existing: chosen.length - inserted.length };
  });
}

async function fetchReceipt(messageId: string) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  const response = await new Resend(key).emails.get(messageId);
  return response.data;
}

export async function checkReminderReceipt(
  rfpId: string,
  entryId: string,
  db = actionDb(),
  lookup = fetchReceipt,
) {
  await requireAdminPermission('reminders.send');
  if (!isUuid(rfpId) || !isUuid(entryId)) return { ok: false as const, error: 'INVALID_INPUT' };
  const where = and(scope(rfpId), eq(outboxEntries.id, entryId));
  const [entry] = await db
    .select({ message: outboxEntries.providerMessageId, email: outboxEntries.toAddr })
    .from(outboxEntries)
    .where(where);
  if (!entry?.message) return { ok: false as const, error: 'RECEIPT_UNKNOWN' };
  const checkedAt = new Date();
  const receipt = await lookup(entry.message).catch(() => null);
  if (
    !receipt ||
    receipt.id !== entry.message ||
    !Array.isArray(receipt.tags) ||
    !receipt.to.some((to) => to.toLowerCase() === entry.email.toLowerCase()) ||
    !receipt.tags?.some((tag) => tag.name === 'outbox_id' && tag.value === entryId)
  )
    return { ok: false as const, error: 'RECEIPT_UNKNOWN' };
  await db
    .update(outboxEntries)
    .set({ providerEvent: receipt.last_event, providerCheckedAt: checkedAt })
    .where(
      and(
        where,
        eq(outboxEntries.providerMessageId, entry.message),
        or(isNull(outboxEntries.providerCheckedAt), lt(outboxEntries.providerCheckedAt, checkedAt)),
      ),
    );
  return { ok: true as const };
}
