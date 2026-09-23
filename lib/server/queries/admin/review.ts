import { and, asc, desc, eq, gte, ilike, lt, sql } from 'drizzle-orm';
import { ADMIN_PAGE_SIZE, dateBounds, pageNumber, type ListParams } from '@/lib/admin-list';
import { workspaces, verificationApplications, pgProfiles, bizProfiles } from '@/lib/db/schema';
import { actionDb } from '@/lib/server/actions/auth/_shared';
import { getWorkspaceAdminUser } from './workspaceOwner';

type DB = ReturnType<typeof actionDb>;

export interface PendingApplicationRow {
  applicationId: string;
  workspaceId: string;
  workspaceName: string;
  orgType: string;
  status: string;
  submittedAt: Date;
  reviewedAt: Date | null;
}

export async function listApplications(
  opts: { status?: string; type?: string } = {},
  db: DB = actionDb(),
): Promise<PendingApplicationRow[]> {
  const { status, type } = opts;
  const rows = await db
    .select({
      applicationId: verificationApplications.id,
      workspaceId: workspaces.id,
      workspaceName: workspaces.name,
      orgType: verificationApplications.orgType,
      status: verificationApplications.status,
      submittedAt: verificationApplications.submittedAt,
      reviewedAt: verificationApplications.reviewedAt,
    })
    .from(verificationApplications)
    .innerJoin(workspaces, eq(verificationApplications.workspaceId, workspaces.id))
    .where(
      and(
        status && status !== 'all'
          ? eq(
              verificationApplications.status,
              status as
                | 'submitted'
                | 'review_pending'
                | 'needs_more_info'
                | 'approved'
                | 'rejected',
            )
          : undefined,
        type && type !== 'all'
          ? eq(verificationApplications.orgType, type)
          : undefined,
      ),
    )
    .orderBy(desc(verificationApplications.submittedAt));
  return rows as PendingApplicationRow[];
}

export async function listApplicationsPage(opts: ListParams = {}, db: DB = actionDb()) {
  const { fromDate, toDate } = dateBounds(opts.from, opts.to);
  const validStatus = ['submitted', 'review_pending', 'needs_more_info', 'approved', 'rejected'];
  const where = and(
    validStatus.includes(opts.status ?? '') ? eq(verificationApplications.status, opts.status as 'submitted' | 'review_pending' | 'needs_more_info' | 'approved' | 'rejected') : undefined,
    ['buyer', 'pg'].includes(opts.type ?? '') ? eq(verificationApplications.orgType, opts.type!) : undefined,
    opts.q ? ilike(workspaces.name, `%${opts.q}%`) : undefined,
    fromDate ? gte(verificationApplications.submittedAt, fromDate) : undefined,
    toDate ? lt(verificationApplications.submittedAt, toDate) : undefined,
  );
  const [{ total }] = await db.select({ total: sql<number>`cast(count(*) as int)` }).from(verificationApplications).innerJoin(workspaces, eq(verificationApplications.workspaceId, workspaces.id)).where(where);
  const page = Math.min(pageNumber(opts.page), Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE)));
  const order = opts.sort === 'oldest' ? [asc(verificationApplications.submittedAt), asc(verificationApplications.id)] : opts.sort === 'name' ? [asc(workspaces.name), asc(verificationApplications.id)] : [desc(verificationApplications.submittedAt), desc(verificationApplications.id)];
  const rows = await db.select({ applicationId: verificationApplications.id, workspaceId: workspaces.id, workspaceName: workspaces.name, orgType: verificationApplications.orgType, status: verificationApplications.status, submittedAt: verificationApplications.submittedAt, reviewedAt: verificationApplications.reviewedAt })
    .from(verificationApplications).innerJoin(workspaces, eq(verificationApplications.workspaceId, workspaces.id)).where(where)
    .orderBy(...order).limit(ADMIN_PAGE_SIZE).offset((page - 1) * ADMIN_PAGE_SIZE);
  return { rows: rows as PendingApplicationRow[], total, page };
}

export async function getApplicationDetail(applicationId: string, db: DB = actionDb()) {
  const [app] = await db
    .select()
    .from(verificationApplications)
    .where(eq(verificationApplications.id, applicationId));
  if (!app) return null;

  const [ws] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, app.workspaceId));

  const [profile] = await db
    .select()
    .from(pgProfiles)
    .where(eq(pgProfiles.workspaceId, app.workspaceId));

  // buyer 워크스페이스의 현재 biz_profile — 등급 지정 화면에서 bizNo 표시 + 현재 등급 프리셀렉트용.
  const currentBizProfile =
    ws.bizProfileId
      ? (await db
          .select()
          .from(bizProfiles)
          .where(eq(bizProfiles.id, ws.bizProfileId))
          .limit(1))[0] ?? null
      : null;

  const ownerContact = await getWorkspaceAdminUser(app.workspaceId, db);

  return {
    application: app,
    workspace: ws,
    pgProfile: profile ?? null,
    bizProfile: currentBizProfile,
    ownerContact,
  };
}
