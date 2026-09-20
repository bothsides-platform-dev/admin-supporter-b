import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ denied: false, db: undefined as unknown }));
vi.mock('@/lib/auth/admin-session', () => ({
  requireAdminSession: async () => {
    if (mocks.denied) throw new Error('UNAUTHENTICATED');
    return { adminId: 'ops@example.com' };
  },
}));
vi.mock('@/lib/server/actions/auth/_shared', () => ({ actionDb: () => mocks.db }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
import { saveAgreementRatesAction } from '../agreementRates';
import { parseAgreementRateForm, AgreementRatesSchema, agreementRateInputValue } from '@/lib/agreement-rates';
let client: PGlite;
const pgWsId = '20000000-0000-4000-8000-000000000001';
const buyerId = '20000000-0000-4000-8000-000000000002';
beforeEach(async () => {
  mocks.denied = false;
  client = new PGlite();
  await client.exec(`
    CREATE TABLE workspaces (id uuid PRIMARY KEY, type text NOT NULL);
    CREATE TABLE pg_agreement_rates (pg_ws_id uuid PRIMARY KEY REFERENCES workspaces(id), version integer NOT NULL DEFAULT 1, rates jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE admin_audit_logs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor text NOT NULL, action text NOT NULL, entity_type text NOT NULL, entity_id uuid NOT NULL, payload_json jsonb, occurred_at timestamptz NOT NULL DEFAULT now());
    INSERT INTO workspaces VALUES ('${pgWsId}', 'pg'), ('${buyerId}', 'buyer');
  `);
  mocks.db = drizzle(client);
});
afterEach(async () => {
  await client.close();
});
it('PG 표준 요율과 변경 전후 감사를 함께 저장하고 이전 판본의 덮어쓰기를 거부한다', async () => {
  const rates = [
    { key: 'card:general', rate: 0.034 },
    { key: 'virtual_account', rate: 300 },
  ];
  expect(await saveAgreementRatesAction({ pgWsId, version: 0, rates })).toEqual({
    ok: true,
    version: 1,
  });
  expect(await saveAgreementRatesAction({ pgWsId, version: 0, rates: [] })).toMatchObject({
    ok: false,
    error: 'RATES_CHANGED',
  });
  expect(await saveAgreementRatesAction({ pgWsId, version: 1, rates: [] })).toEqual({
    ok: true,
    version: 2,
  });
  const audit = await client.query<{
    payload_json: { before: { rates: unknown }; after: { rates: unknown } };
  }>('SELECT payload_json FROM admin_audit_logs ORDER BY occurred_at');
  expect(audit.rows).toHaveLength(2);
  expect(audit.rows[1].payload_json).toMatchObject({ before: { rates }, after: { rates: [] } });
});
it('비관리자, 구매사, 요율·키 주입을 거부한다', async () => {
  expect(await saveAgreementRatesAction({ pgWsId: buyerId, version: 0, rates: [] })).toMatchObject({
    ok: false,
    error: 'PG_WORKSPACE_REQUIRED',
  });
  expect(
    await saveAgreementRatesAction({
      pgWsId,
      version: 0,
      rates: [{ key: 'bank_transfer', rate: 2 }],
    }),
  ).toMatchObject({ ok: false, error: 'INVALID_INPUT' });
  expect(
    AgreementRatesSchema.safeParse([
      { key: 'bank_transfer', rate: 0 },
      { key: 'bank_transfer', rate: 0 },
    ]).success,
  ).toBe(false);
  expect(AgreementRatesSchema.safeParse([{ key: 'unknown', rate: 0.01 }]).success).toBe(false);
  mocks.denied = true;
  await expect(saveAgreementRatesAction({ pgWsId, version: 0, rates: [] })).rejects.toThrow(
    'UNAUTHENTICATED',
  );
  expect((await client.query('SELECT * FROM pg_agreement_rates')).rows).toEqual([]);
});
it('빈칸은 미등록, 0은 0%, 퍼센트는 소수 요율, 정액은 원으로 해석한다', () => {
  const form = new FormData();
  form.set('rate:bank_transfer', '2');
  form.set('rate:virtual_account', '300');
  form.set('rate:card:general', '0');
  form.set('rate:mobile', '');
  form.set('customLabel', '직접 결제');
  form.set('customRate', '1.5');
  const result = parseAgreementRateForm(form);
  expect(result).toMatchObject({
    ok: true,
    rates: expect.arrayContaining([
      { key: 'bank_transfer', rate: 0.02 },
      { key: 'virtual_account', rate: 300 },
      { key: 'card:general', rate: 0 },
      { key: 'custom:직접 결제', rate: 0.015 },
    ]),
  });
  if (result.ok) expect(result.rates.some((r) => r.key === 'mobile')).toBe(false);
  form.set('customRate', '잘못된 입력');
  expect(parseAgreementRateForm(form).ok).toBe(false);
});
it('존재하지 않는 PG에는 기준과 감사 기록을 만들지 않는다', async () => {
  expect(
    await saveAgreementRatesAction({
      pgWsId: '20000000-0000-4000-8000-000000000099',
      version: 0,
      rates: [],
    }),
  ).toEqual({ ok: false, error: 'PG_WORKSPACE_REQUIRED' });
  expect((await client.query('SELECT * FROM pg_agreement_rates')).rows).toHaveLength(0);
  expect((await client.query('SELECT * FROM admin_audit_logs')).rows).toHaveLength(0);
});
it('폼에서 음수·백분율 초과·정액 소수·중복 직접입력을 거부한다', () => {
  const cases: Array<[string, string]> = [
    ['rate:bank_transfer', '-1'],
    ['rate:bank_transfer', '100.01'],
    ['rate:virtual_account', '1.5'],
    ['rate:virtual_account', '1000001'],
    ['customRate', '100.01'],
  ];
  for (const [key, value] of cases) {
    const form = new FormData();
    if (key === 'customRate') form.set('customLabel', '직접');
    form.set(key, value);
    expect(parseAgreementRateForm(form)).toEqual({ ok: false });
  }
  const duplicate = new FormData();
  duplicate.append('customLabel', '직접');
  duplicate.append('customRate', '1');
  duplicate.append('customLabel', '직접');
  duplicate.append('customRate', '2');
  expect(parseAgreementRateForm(duplicate)).toEqual({ ok: false });
});
it('감사 기록 저장이 실패하면 기존 기준 변경도 롤백한다', async () => {
  const rates = [{ key: 'card:general', rate: 0.025 }];
  expect(await saveAgreementRatesAction({ pgWsId, version: 0, rates })).toEqual({
    ok: true,
    version: 1,
  });
  await client.exec(`
    CREATE FUNCTION reject_rate_audit() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'audit unavailable'; END;
    $$;
    CREATE TRIGGER reject_rate_audit BEFORE INSERT ON admin_audit_logs
    FOR EACH ROW EXECUTE FUNCTION reject_rate_audit();
  `);
  await expect(saveAgreementRatesAction({ pgWsId, version: 1, rates: [] })).rejects.toThrow();
  const stored = await client.query<{ version: number; rates: unknown }>(
    'SELECT version, rates FROM pg_agreement_rates WHERE pg_ws_id = $1',
    [pgWsId],
  );
  expect(stored.rows).toEqual([{ version: 1, rates }]);
  expect((await client.query('SELECT * FROM admin_audit_logs')).rows).toHaveLength(1);
});
it('허용 행 수·직접입력 키 길이·숫자 타입 상한을 서버에서도 거부한다', async () => {
  const invalidRates: unknown[] = [
    Array.from({ length: 101 }, (_, i) => ({ key: `custom:항목${i}`, rate: 0.01 })),
    [{ key: `custom:${'가'.repeat(101)}`, rate: 0.01 }],
    [{ key: 'card:general', rate: Number.POSITIVE_INFINITY }],
    [{ key: 'card:general', rate: Number.NaN }],
    [{ key: 'card:general', rate: '0.01' }],
  ];
  for (const rates of invalidRates) {
    expect(await saveAgreementRatesAction({ pgWsId, version: 0, rates })).toEqual({
      ok: false,
      error: 'INVALID_INPUT',
    });
  }
  expect((await client.query('SELECT * FROM pg_agreement_rates')).rows).toHaveLength(0);
  expect((await client.query('SELECT * FROM admin_audit_logs')).rows).toHaveLength(0);
});
it('직접입력 결제수단의 줄바꿈과 앞뒤 공백을 원문 그대로 저장한다', async () => {
  const label = ' 앞\n뒤 ';
  const form = new FormData();
  form.append('customLabel', label);
  form.append('customRate', '2.5');
  const parsed = parseAgreementRateForm(form);
  expect(parsed).toEqual({ ok: true, rates: [{ key: `custom:${label}`, rate: 0.025 }] });
  if (!parsed.ok) return;
  expect(await saveAgreementRatesAction({ pgWsId, version: 0, rates: parsed.rates })).toEqual({
    ok: true,
    version: 1,
  });
  const stored = await client.query<{ rates: unknown }>(
    'SELECT rates FROM pg_agreement_rates WHERE pg_ws_id = $1',
    [pgWsId],
  );
  expect(stored.rows[0]?.rates).toEqual(parsed.rates);
});
it('수정하지 않은 높은 정밀도 요율은 표시와 재저장을 거쳐도 원본 값이 유지된다', () => {
  const original = [
    { key: 'bank_transfer', rate: 0.00000000001 },
    { key: 'custom: 앞\n뒤 ', rate: 0.12345678901234567 },
  ];
  const form = new FormData();
  form.set('rate:bank_transfer', agreementRateInputValue(original[0].rate, false));
  form.append('customLabel', ' 앞\n뒤 ');
  form.append('customRate', agreementRateInputValue(original[1].rate, false));
  expect(agreementRateInputValue(original[0].rate, false)).toBe('0.000000001');
  expect(parseAgreementRateForm(form, original)).toEqual({ ok: true, rates: original });
});
