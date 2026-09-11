import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { describe, expect, it } from 'vitest';
import { getHotlist } from '../dashboard';

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
