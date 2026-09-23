import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { describe, expect, it } from 'vitest';
import { getHotlist, getDashboardStats, getOldestApplications } from '../dashboard';

describe('getHotlist', () => {
  it('마감 임박 RFP 상세 링크에 표시용 코드가 아닌 UUID를 사용한다', async () => {
    const client = new PGlite();
    await client.exec(`
      CREATE TABLE rfps (
        id uuid PRIMARY KEY,
        code text NOT NULL,
        title text NOT NULL,
        deadline timestamptz NOT NULL,
        status text NOT NULL
      );
    `);

    const rfpId = '20000000-0000-4000-8000-000000000001';
    const deadline = new Date(Date.now() + 24 * 3600_000).toISOString();
    await client.query(
      `INSERT INTO rfps (id, code, title, deadline, status)
       VALUES ($1, $2, $3, $4, $5)`,
      [rfpId, 'P-2609-0001', '마감 임박 RFP', deadline, 'sent'],
    );

    const db = drizzle(client);
    const hotlist = await getHotlist(
      db as unknown as Parameters<typeof getHotlist>[0],
    );

    expect(hotlist).toHaveLength(1);
    expect(hotlist[0].href).toBe(`/rfps/${rfpId}`);
  });
});

it('대시보드 건수가 연결된 목록의 신청·담당자 상태와 일치한다', async () => {
  const client = new PGlite();
  try {
    await client.exec(`
      CREATE TABLE workspaces (id uuid PRIMARY KEY, name text, type text, status text);
      CREATE TABLE verification_applications (id uuid PRIMARY KEY, workspace_id uuid, status text, submitted_at timestamptz);
      CREATE TABLE workspace_name_change_requests (status text);
      CREATE TABLE workspace_members (workspace_id uuid, approval_status text);
      CREATE TABLE rfps (status text);
      INSERT INTO workspaces VALUES ('10000000-0000-4000-8000-000000000001', '대기 PG', 'pg', 'pending');
      INSERT INTO verification_applications VALUES
        ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'submitted', now() - interval '3 days'),
        ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'rejected', now() - interval '4 days');
      INSERT INTO workspace_name_change_requests VALUES ('pending'), ('approved');
      INSERT INTO workspace_members VALUES ('10000000-0000-4000-8000-000000000001', 'pending_approval'), ('10000000-0000-4000-8000-000000000001', 'approved');
      INSERT INTO rfps VALUES ('sent'), ('sent'), ('closed');
    `);
    const db = drizzle(client) as unknown as Parameters<typeof getDashboardStats>[0];
    expect(await getDashboardStats(db)).toEqual({ pendingReviewCount: 1, activeRfpCount: 2, pendingNameChangeCount: 1, pendingMemberCount: 1 });
    const oldest = await getOldestApplications(db);
    expect(oldest).toHaveLength(1);
    expect(oldest[0]).toMatchObject({ id: '20000000-0000-4000-8000-000000000001', waitingDays: 3 });
  } finally { await client.close(); }
});
