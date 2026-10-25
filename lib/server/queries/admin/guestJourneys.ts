import { and, asc, desc, eq, gte, ilike, lt, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { requireAdminPermission } from '@/lib/auth/admin-session';
import { ADMIN_PAGE_SIZE, dateBounds, pageNumber, type ListParams } from '@/lib/admin-list';
import { guestJourneys as journeys, guestJourneyEvents as events } from '@/lib/db/schema/guest-journeys';
import { users, workspaces } from '@/lib/db/schema';
import { actionDb } from '@/lib/server/actions/auth/_shared';

// Same injectable SQL boundary as other admin queries (Postgres / PGlite).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = any;
const status = sql<string>`CASE WHEN ${journeys.deletedAt} IS NOT NULL THEN 'deleted' WHEN ${journeys.retiredAt} IS NOT NULL THEN 'submitted' ELSE 'in_progress' END`;
const projection = {
  draftId: journeys.draftId, userId: journeys.userId, workspaceId: journeys.workspaceId,
  createdAt: journeys.createdAt, retiredAt: journeys.retiredAt, deletedAt: journeys.deletedAt,
  userName: users.name, email: users.email, workspaceName: workspaces.name, status,
};
export type JourneyRow = {
  draftId: string; userId: string | null; workspaceId: string | null;
  createdAt: Date; retiredAt: Date | null; deletedAt: Date | null;
  userName: string | null; email: string | null; workspaceName: string | null; status: string;
};
const payloadSchema = z.object({
  name: z.string().max(80), funnel_id: z.string().max(40), step_id: z.string().max(40),
  answer: z.string().max(500).optional(), error_code: z.string().max(80).optional(),
  progression: z.enum(['next', 'skip']).optional(), mode: z.enum(['write', 'edit']).optional(),
});
export type JourneyEvent = z.infer<typeof payloadSchema> & { id: string; observedAt: Date; createdAt: Date };
const analyticsSchema = z.array(z.object({
  observedAt: z.string().datetime(),
  ga: z.object({ clientId: z.string().regex(/^\d{1,20}\.\d{1,20}$/), sessionId: z.string().regex(/^\d{1,20}$/) }).optional(),
  clarity: z.object({ userId: z.string().regex(/^[a-z0-9]{1,64}$/), sessionId: z.string().regex(/^[a-z0-9]{1,64}$/) }).optional(),
})).max(50);

export async function listGuestJourneys(opts: ListParams = {}, db: DB = actionDb()): Promise<{ rows: JourneyRow[]; total: number; page: number }> {
  await requireAdminPermission('data.view');
  const { fromDate, toDate } = dateBounds(opts.from, opts.to);
  const q = opts.q?.trim().slice(0, 200);
  const where = and(
    q ? or(ilike(sql`${journeys.draftId}::text`, `%${q}%`), ilike(users.email, `%${q}%`), ilike(workspaces.name, `%${q}%`)) : undefined,
    ['in_progress', 'submitted', 'deleted'].includes(opts.status ?? '') ? eq(status, opts.status!) : undefined,
    fromDate ? gte(journeys.createdAt, fromDate) : undefined,
    toDate ? lt(journeys.createdAt, toDate) : undefined,
  );
  const query = (fields: Record<string, unknown>) => db.select(fields).from(journeys)
    .leftJoin(users, eq(journeys.userId, users.id)).leftJoin(workspaces, eq(journeys.workspaceId, workspaces.id)).where(where);
  const [{ total }] = await query({ total: sql<number>`count(*)::int` }) as { total: number }[];
  const page = Math.min(pageNumber(opts.page), Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE)));
  const order = opts.sort === 'oldest' ? asc : desc;
  const rows = await query(projection).orderBy(order(journeys.createdAt), order(journeys.draftId))
    .limit(ADMIN_PAGE_SIZE).offset((page - 1) * ADMIN_PAGE_SIZE) as JourneyRow[];
  return { rows, total, page };
}

export async function getGuestJourney(id: string, opts: ListParams = {}, db: DB = actionDb()) {
  await requireAdminPermission('data.view');
  if (!z.uuid().safeParse(id).success) return null;
  const [journey] = await db.select({ ...projection, analytics: journeys.analytics }).from(journeys)
    .leftJoin(users, eq(journeys.userId, users.id)).leftJoin(workspaces, eq(journeys.workspaceId, workspaces.id))
    .where(eq(journeys.draftId, id)) as (JourneyRow & { analytics: unknown })[];
  if (!journey) return null;
  // 5,000 browser observations plus two server successes. Return one page to the UI.
  const raw = await db.select({ id: events.id, payload: events.payload, observedAt: events.observedAt, createdAt: events.createdAt })
    .from(events).where(eq(events.draftId, id)).orderBy(asc(events.observedAt), asc(events.id)).limit(5002) as
    { id: string; payload: unknown; observedAt: Date; createdAt: Date }[];
  const all: JourneyEvent[] = raw.map(row => {
    const parsed = payloadSchema.safeParse(row.payload);
    return { id: row.id, observedAt: row.observedAt, createdAt: row.createdAt,
      ...(parsed.success ? parsed.data : { name: 'unknown', funnel_id: '', step_id: 'unknown' }) };
  });
  const answers = new Map<string, JourneyEvent>();
  for (const event of all) if (event.name === 'funnel_step_complete' && event.answer !== undefined) answers.set(`${event.funnel_id}:${event.step_id}`, event);
  const total = all.length;
  const page = Math.min(pageNumber(opts.page), Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE)));
  const analytics = analyticsSchema.safeParse(journey.analytics);
  return { journey: { ...journey, analytics: analytics.success ? analytics.data : [] },
    events: all.slice((page - 1) * ADMIN_PAGE_SIZE, page * ADMIN_PAGE_SIZE), answers: [...answers.values()],
    total, page, errorCount: all.filter(e => e.name === 'funnel_step_error').length, lastEvent: all.at(-1) ?? null };
}
