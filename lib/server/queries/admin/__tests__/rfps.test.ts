import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { describe, expect, it } from 'vitest';
import { getRfpDetail, listAllRfps } from '../rfps';

// getRfpDetail 이 select(rfps) 로 테이블 전체를 조회하므로(부분 컬럼 select 가 아님),
// 여기 rfps 테이블 DDL 은 lib/db/schema/rfps.ts 의 전 컬럼을 그대로 반영해야 한다 —
// 하나라도 빠지면 drizzle 이 생성한 SELECT 가 존재하지 않는 컬럼을 조회해 즉시 에러난다.
const SCHEMA_SQL = `
  CREATE TABLE users (id uuid PRIMARY KEY, name text NOT NULL, email text NOT NULL);
  CREATE TABLE workspaces (id uuid PRIMARY KEY, name text NOT NULL);
  CREATE TABLE biz_profiles (
    id uuid PRIMARY KEY, biz_no text, tax_type text, grade text, grade_source text NOT NULL
  );
  CREATE TABLE rfps (
    id uuid PRIMARY KEY,
    code text NOT NULL,
    buyer_ws_id uuid NOT NULL,
    biz_profile_id uuid,
    title text NOT NULL,
    memo text NOT NULL DEFAULT '',
    website_url text,
    main_products text,
    deadline timestamptz NOT NULL,
    share_token text NOT NULL,
    status text NOT NULL DEFAULT 'draft',
    awarded_bid_id uuid,
    created_by uuid NOT NULL,
    board_column_id uuid,
    required_payment_methods text[] NOT NULL DEFAULT '{}',
    custom_payment_methods jsonb NOT NULL DEFAULT '[]',
    board_visible boolean NOT NULL DEFAULT true,
    current_terms jsonb NOT NULL DEFAULT '{"_v":1}',
    hidden_from_pg text[] NOT NULL DEFAULT '{}',
    contract_type text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    sent_at timestamptz
  );
  CREATE TABLE bids (
    id uuid PRIMARY KEY,
    rfp_id uuid NOT NULL,
    pg_ws_id uuid NOT NULL,
    settle_cycle text NOT NULL,
    settle_limit numeric(14,2) NOT NULL DEFAULT '0',
    guarantee_insurance numeric(14,2) NOT NULL DEFAULT '0',
    payment_fees jsonb NOT NULL DEFAULT '{}',
    custom_fees jsonb NOT NULL DEFAULT '{}',
    memo text NOT NULL DEFAULT '',
    round integer NOT NULL DEFAULT 1,
    status text NOT NULL DEFAULT 'submitted',
    submitted_by uuid NOT NULL,
    submitted_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE TABLE contracts (
    id uuid PRIMARY KEY, rfp_id uuid NOT NULL, bid_id uuid NOT NULL,
    awarded_at timestamptz NOT NULL DEFAULT now(), awarded_by uuid NOT NULL
  );
  CREATE TABLE attachments (
    id uuid PRIMARY KEY, name text NOT NULL, size integer NOT NULL, mime_type text NOT NULL,
    uploaded_by uuid NOT NULL, rfp_id uuid, bid_id uuid, status text NOT NULL DEFAULT 'ready',
    uploaded_at timestamptz NOT NULL DEFAULT now()
  );
`;

const BUYER_WS = '10000000-0000-4000-8000-000000000001';
const PG_ALPHA_WS = '10000000-0000-4000-8000-000000000002';
const PG_BETA_WS = '10000000-0000-4000-8000-000000000003';
const CREATOR = '30000000-0000-4000-8000-000000000001';
const PG_ALPHA_USER = '30000000-0000-4000-8000-000000000002';
const PG_BETA_USER = '30000000-0000-4000-8000-000000000003';
const AWARDER = '30000000-0000-4000-8000-000000000004';
const BIZ_PROFILE = '40000000-0000-4000-8000-000000000001';
const RFP_ID = '20000000-0000-4000-8000-000000000001';
const BID_ALPHA_R1 = '50000000-0000-4000-8000-000000000001';
const BID_BETA_R1 = '50000000-0000-4000-8000-000000000002';
const BID_ALPHA_R2 = '50000000-0000-4000-8000-000000000003';

async function seedFullRfp(client: PGlite) {
  await client.exec(SCHEMA_SQL);
  await client.exec(`
    INSERT INTO users VALUES
      ('${CREATOR}', '작성자박', 'buyer@example.com'),
      ('${PG_ALPHA_USER}', '김PG', 'alpha@example.com'),
      ('${PG_BETA_USER}', '이PG', 'beta@example.com'),
      ('${AWARDER}', '관리자김', 'admin@example.com');
    INSERT INTO workspaces VALUES
      ('${BUYER_WS}', '테스트구매사'),
      ('${PG_ALPHA_WS}', 'AlphaPG'),
      ('${PG_BETA_WS}', 'BetaPG');
    INSERT INTO biz_profiles VALUES
      ('${BIZ_PROFILE}', '123-45-67890', 'general', 'sme1', 'admin_confirmed');
    INSERT INTO rfps (
      id, code, buyer_ws_id, biz_profile_id, title, memo, deadline, share_token,
      status, awarded_bid_id, created_by, required_payment_methods, custom_payment_methods,
      current_terms, contract_type
    ) VALUES (
      '${RFP_ID}', 'P-2609-0001', '${BUYER_WS}', '${BIZ_PROFILE}', '테스트 RFP', 'RFP 메모',
      '2026-09-20T00:00:00Z', 'share-token-xyz',
      'sent', '${BID_ALPHA_R1}', '${CREATOR}', '{card,virtual_account}',
      '[{"id":"custom-x","label":"기타수단"}]',
      '{"_v":1,"feeRate":"3.5"}', 'new'
    );
    INSERT INTO bids (id, rfp_id, pg_ws_id, settle_cycle, settle_limit, guarantee_insurance, payment_fees, custom_fees, memo, round, status, submitted_by) VALUES
      ('${BID_ALPHA_R1}', '${RFP_ID}', '${PG_ALPHA_WS}', 'D+1', '5000000.00', '1000000.00', '{"card":0.0125,"virtual_account":300}', '{"custom-x":0.02}', '견적 메모1', 1, 'submitted', '${PG_ALPHA_USER}'),
      ('${BID_ALPHA_R2}', '${RFP_ID}', '${PG_ALPHA_WS}', 'D+2', '6000000.00', '1200000.00', '{}', '{}', '', 2, 'submitted', '${PG_ALPHA_USER}'),
      ('${BID_BETA_R1}', '${RFP_ID}', '${PG_BETA_WS}', 'W+1', '3000000.00', '500000.00', '{}', '{}', 'B사 메모', 1, 'submitted', '${PG_BETA_USER}');
    INSERT INTO contracts (id, rfp_id, bid_id, awarded_by) VALUES
      ('70000000-0000-4000-8000-000000000001', '${RFP_ID}', '${BID_ALPHA_R1}', '${AWARDER}');
    INSERT INTO attachments (id, name, size, mime_type, uploaded_by, rfp_id, status) VALUES
      ('80000000-0000-4000-8000-000000000001', '견적요청서.pdf', 1024, 'application/pdf', '${CREATOR}', '${RFP_ID}', 'ready'),
      ('80000000-0000-4000-8000-000000000003', '업로드중.pdf', 10, 'application/pdf', '${CREATOR}', '${RFP_ID}', 'pending');
    INSERT INTO attachments (id, name, size, mime_type, uploaded_by, bid_id, status) VALUES
      ('80000000-0000-4000-8000-000000000002', '제안서.pdf', 2048, 'application/pdf', '${PG_ALPHA_USER}', '${BID_ALPHA_R1}', 'ready');
  `);
}

describe('getRfpDetail', () => {
  it('구매사/작성자/사업자정보/견적/낙찰/첨부를 모두 정규화해 반환한다', async () => {
    const client = new PGlite();
    await seedFullRfp(client);
    const db = drizzle(client);

    const detail = await getRfpDetail(RFP_ID, db);
    if (!detail) throw new Error('detail must not be null');

    expect(detail.rfp.code).toBe('P-2609-0001');
    expect(detail.buyerName).toBe('테스트구매사');
    expect(detail.createdByName).toBe('작성자박');
    expect(detail.bizProfile).toEqual({
      bizNo: '123-45-67890',
      taxType: 'general',
      grade: 'sme1',
      gradeSource: 'admin_confirmed',
    });
    expect(detail.currentTerms.feeRate).toBe('3.5');
    expect(detail.customPaymentMethods).toEqual([{ id: 'custom-x', label: '기타수단' }]);

    // 정렬: pgWsName asc, round asc — 같은 PG(AlphaPG)가 라운드별로 분리된 열이 된다.
    expect(detail.bids.map((b) => [b.pgWsName, b.round])).toEqual([
      ['AlphaPG', 1],
      ['AlphaPG', 2],
      ['BetaPG', 1],
    ]);

    const first = detail.bids[0];
    // numeric(14,2) 컬럼은 drizzle-postgres 가 문자열로 반환한다 — Number 변환 확인.
    expect(first.settleLimit).toBe(5000000);
    expect(typeof first.settleLimit).toBe('number');
    expect(first.guaranteeInsurance).toBe(1000000);
    expect(first.paymentFees).toEqual({ card: 0.0125, virtual_account: 300 });
    expect(first.customFees).toEqual({ 'custom-x': 0.02 });

    expect(detail.contract).toEqual(
      expect.objectContaining({ bidId: BID_ALPHA_R1, awardedByName: '관리자김' }),
    );

    // status='pending' 인 업로드중 첨부는 제외되어야 한다.
    expect(detail.attachments).toEqual([
      expect.objectContaining({ name: '견적요청서.pdf' }),
    ]);
    expect(detail.proposalAttachments).toEqual([
      expect.objectContaining({ name: '제안서.pdf' }),
    ]);
  });

  it('존재하지 않는 RFP id 는 null 을 반환한다', async () => {
    const client = new PGlite();
    await seedFullRfp(client);
    const db = drizzle(client);

    expect(await getRfpDetail('99999999-0000-4000-8000-000000000099', db)).toBeNull();
  });

  it('bizProfile 이 없고 견적이 하나도 없으면 bizProfile=null, 견적/계약/제안서 첨부가 모두 빈 배열이다', async () => {
    const client = new PGlite();
    await client.exec(SCHEMA_SQL);
    await client.exec(`
      INSERT INTO users VALUES ('${CREATOR}', '작성자박', 'buyer@example.com');
      INSERT INTO workspaces VALUES ('${BUYER_WS}', '테스트구매사');
      INSERT INTO rfps (id, code, buyer_ws_id, biz_profile_id, title, deadline, share_token, created_by)
      VALUES ('${RFP_ID}', 'P-2609-0002', '${BUYER_WS}', NULL, '견적 없는 RFP', '2026-09-20T00:00:00Z', 'tok', '${CREATOR}');
    `);
    const db = drizzle(client);

    const detail = await getRfpDetail(RFP_ID, db);
    if (!detail) throw new Error('detail must not be null');

    expect(detail.bizProfile).toBeNull();
    expect(detail.bids).toEqual([]);
    expect(detail.contract).toBeNull();
    // bidIds가 비어있으면 proposalAttachments 쿼리 자체를 건너뛴다(단축 분기).
    expect(detail.proposalAttachments).toEqual([]);
    expect(detail.currentTerms._v).toBe(1);
  });
});

describe('listAllRfps', () => {
  it('구매사명을 조인해 최신순으로 반환하고 q/status 로 필터링한다', async () => {
    const client = new PGlite();
    await seedFullRfp(client);
    const db = drizzle(client);

    const all = await listAllRfps({}, db);
    expect(all).toEqual([
      expect.objectContaining({ code: 'P-2609-0001', buyerName: '테스트구매사', status: 'sent' }),
    ]);

    expect(await listAllRfps({ q: '존재하지않음' }, db)).toEqual([]);
    expect(await listAllRfps({ status: 'draft' }, db)).toEqual([]);
    expect(await listAllRfps({ status: 'sent' }, db)).toHaveLength(1);
  });
});
