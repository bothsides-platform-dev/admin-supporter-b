import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { expect, it } from 'vitest';
import { listApplicationsPage } from '../review';
import { getApplicationReviewHistory } from '../reviewHistory';
import { gradeSourceLabel } from '@/lib/types/biz-profile';

it('auto approved applications appear in approved history, never the pending filter', async () => {
  const pg = new PGlite();
  try {
    await pg.exec(`
      CREATE TABLE workspaces (id uuid PRIMARY KEY, name text);
      CREATE TABLE verification_applications (id uuid PRIMARY KEY, workspace_id uuid, org_type text, status text, submitted_at timestamptz, reviewed_at timestamptz);
      CREATE TABLE admin_audit_logs (id uuid PRIMARY KEY, actor text, action text, entity_type text, entity_id uuid, payload_json jsonb, occurred_at timestamptz);
      INSERT INTO workspaces VALUES ('10000000-0000-4000-8000-000000000001','자동 구매사');
      INSERT INTO verification_applications VALUES ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','buyer','approved',now(),now());
      INSERT INTO admin_audit_logs VALUES ('30000000-0000-4000-8000-000000000001','system:bona-pay','workspace.auto_approve','verification_application','20000000-0000-4000-8000-000000000001','{"after":{"status":"approved","provider":"bona-pay","gradeSource":"api_confirmed","outcome":"sole_confirmed","effectiveDate":"2026-07-01"}}',now());
    `);
    const db = drizzle(pg) as unknown as Parameters<typeof listApplicationsPage>[1];
    expect((await listApplicationsPage({ status: 'submitted' }, db)).total).toBe(0);
    expect((await listApplicationsPage({ status: 'review_pending' }, db)).total).toBe(0);
    expect((await listApplicationsPage({ status: 'approved' }, db)).rows).toEqual([
      expect.objectContaining({ workspaceName: '자동 구매사', status: 'approved', reviewedAt: expect.any(Date) }),
    ]);
    const history = await getApplicationReviewHistory('20000000-0000-4000-8000-000000000001', db);
    expect(history).toHaveLength(1);
    expect(history[0].payloadJson?.after).toMatchObject({ provider: 'bona-pay', outcome: 'sole_confirmed' });
    expect(gradeSourceLabel(String(history[0].payloadJson?.after?.gradeSource))).toBe('자동 확인');
  } finally {
    await pg.close();
  }
});
