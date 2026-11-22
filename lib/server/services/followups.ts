import { and, eq, isNull } from 'drizzle-orm';
import { requireAdminPermission } from '@/lib/auth/admin-session';
import {
  adminAuditLogs,
  adminFollowups,
  adminFollowupUpdates,
  adminUsers,
  rfps,
  workspaces,
} from '@/lib/db/schema';
import { readKstTime, TASK_CATEGORIES, validChannelUrl } from '@/lib/followups';
import { isUuid } from '@/lib/utils';
import { actionDb } from '@/lib/server/actions/auth/_shared';
import { roundOptions } from '@/lib/server/queries/admin/followups';

function field(form: FormData, name: string) {
  const value = form.get(name);
  return typeof value === 'string' ? value.trim() : '';
}
type Result = { ok: true } | { ok: false; error: string };
const invalid: Result = { ok: false, error: 'INVALID_INPUT' };
const conflict: Result = { ok: false, error: 'STALE_FOLLOWUP' };

export async function saveFollowup(form: FormData, db = actionDb()): Promise<Result> {
  const session = await requireAdminPermission('tasks.write');
  const id = field(form, 'id');
  const mode = field(form, 'mode');
  const version = Number(field(form, 'version'));
  const ownerId = field(form, 'owner') || null;
  const dueAt = readKstTime(field(form, 'due'));
  const title = field(form, 'title');
  const category = field(form, 'category');
  const channelUrl = field(form, 'channel') || null;
  const note = field(form, 'note');
  const link = field(form, 'round');
  const workspaceId = field(form, 'workspace') || null;
  const rfpId = field(form, 'rfp') || null;
  const code = field(form, 'code');
  if (
    !isUuid(id) ||
    !['create', 'update', 'complete', 'link'].includes(mode) ||
    [ownerId, workspaceId, rfpId].some((value) => value && !isUuid(value)) ||
    (mode !== 'create' && (!Number.isSafeInteger(version) || version < 1)) ||
    ((mode === 'update' || mode === 'create') && !dueAt) ||
    note.length > 2000 ||
    (mode === 'complete' && !note) ||
    (mode === 'link' && !code && !workspaceId) ||
    code.length > 80 ||
    (channelUrl && (channelUrl.length > 1000 || !validChannelUrl(channelUrl))) ||
    (mode === 'create' && (!title || title.length > 180 || !Object.hasOwn(TASK_CATEGORIES, category)))
  )
    return invalid;

  return db.transaction(async (tx) => {
    const [existing] =
      mode === 'create'
        ? []
        : await tx.select().from(adminFollowups).where(eq(adminFollowups.id, id)).for('update');
    if (mode !== 'create' && (!existing || existing.version !== version || existing.completedAt))
      return conflict;
    if (ownerId && mode !== 'link') {
      const [owner] = await tx
        .select({ id: adminUsers.id })
        .from(adminUsers)
        .where(eq(adminUsers.id, ownerId))
        .for('key share');
      if (!owner) return invalid;
    }
    if (mode === 'create' || mode === 'link') {
      if (mode === 'link' && existing?.rfpId) return conflict;
      let company = workspaceId ?? existing?.workspaceId ?? null;
      let request = rfpId;
      if (request || code) {
        const [rfp] = await tx
          .select({ id: rfps.id, buyer: rfps.buyerWsId })
          .from(rfps)
          .where(request ? eq(rfps.id, request) : eq(rfps.code, code))
          .for('key share');
        if (!rfp) return invalid;
        const companyIsPg = company && company !== rfp.buyer;
        if (link || companyIsPg) {
          const rounds = await roundOptions(tx, rfp.id);
          if (
            !rounds.some(
              (option) => (!link || option.key === link) && (!companyIsPg || option.pgId === company),
            )
          )
            return invalid;
        }
        request = rfp.id;
        company ??= rfp.buyer;
      }
      if (existing?.workspaceId && company !== existing.workspaceId) return invalid;
      if (company && !request) {
        const [w] = await tx
          .select({ id: workspaces.id })
          .from(workspaces)
          .where(eq(workspaces.id, company))
          .for('key share');
        if (!w) return invalid;
      }
      if (link && !request) return invalid;
      const [kind, targetId] = link.split(':');
      const target = {
        workspaceId: company,
        rfpId: request,
        invitationId: kind === 'invitation' ? targetId : null,
        reviewId: kind === 'review' ? targetId : null,
        bidId: kind === 'bid' ? targetId : null,
        deliveryId: kind === 'delivery' ? targetId : null,
        signingId: kind === 'signing' ? targetId : null,
      };
      if (mode === 'create') {
        const inserted = await tx
          .insert(adminFollowups)
          .values({
            id,
            ...target,
            title,
            category,
            ownerId,
            dueAt: dueAt!,
            channelUrl,
            createdBy: session.adminId,
          })
          .onConflictDoNothing({ target: adminFollowups.id })
          .returning({ id: adminFollowups.id });
        if (!inserted.length) return conflict;
      } else {
        await tx
          .update(adminFollowups)
          .set({ ...target, version: version + 1 })
          .where(eq(adminFollowups.id, id));
      }
    } else {
      await tx
        .update(adminFollowups)
        .set(
          mode === 'complete'
            ? {
                completedAt: new Date(),
                version: version + 1,
                ...(form.has('owner') ? { ownerId } : {}),
                ...(dueAt ? { dueAt } : {}),
                ...(form.has('channel') ? { channelUrl } : {}),
              }
            : { ownerId, dueAt: dueAt!, channelUrl, version: version + 1 },
        )
        .where(and(eq(adminFollowups.id, id), isNull(adminFollowups.completedAt)));
    }
    if (note) await tx.insert(adminFollowupUpdates).values({ taskId: id, note, actor: session.adminId });
    await tx
      .insert(adminAuditLogs)
      .values({
        actor: session.adminId,
        action: `followup.${mode}`,
        entityType: 'followup',
        entityId: id,
        payloadJson: {
          after: {
            version: mode === 'create' ? 1 : version + 1,
            ...(mode === 'create' || mode === 'update' ? { ownerId, dueAt } : {}),
          },
        },
      });
    return { ok: true };
  });
}
