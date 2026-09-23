import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireAdminSession: vi.fn(),
  listSellers: vi.fn(),
  actionDb: vi.fn(),
}));
vi.mock('@/lib/auth/admin-session', () => ({ requireAdminSession: mocks.requireAdminSession }));
vi.mock('@/lib/server/queries/admin/sellers', () => ({ listSellers: mocks.listSellers }));
vi.mock('@/lib/server/actions/auth/_shared', () => ({ actionDb: mocks.actionDb }));
vi.mock('@/lib/server/actions/admin/agreementRates', () => ({ saveAgreementRatesAction: vi.fn() }));

import AgreementRatesPage from '../page';

const pgId = '20000000-0000-4000-8000-000000000001';
beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAdminSession.mockResolvedValue({ adminId: 'ops@example.com', role: 'operator' });
  mocks.listSellers.mockResolvedValue([{ id: pgId, name: '테스트 PG' }]);
  mocks.actionDb.mockReturnValue({
    select: () => ({ from: () => ({ where: async () => [{ version: 3, rates: [{ key: 'bank_transfer', rate: 0.025 }] }] }) }),
  });
});

it('PG 미선택 또는 알 수 없는 PG는 기준을 조회하지 않고 선택 안내를 보여준다', async () => {
  for (const pg of [undefined, 'unknown']) {
    const page = await AgreementRatesPage({ searchParams: Promise.resolve({ pg }) });
    const html = renderToStaticMarkup(page);
    expect(html).toContain('PG사를 선택하면 등록된 기준을 확인하거나');
    expect(html).not.toContain('기준 저장하기');
  }
  expect(mocks.actionDb).not.toHaveBeenCalled();
});

it('선택한 PG의 저장된 요율과 판본을 조회해 복원한다', async () => {
  const page = await AgreementRatesPage({ searchParams: Promise.resolve({ pg: pgId }) });
  const html = renderToStaticMarkup(page);
  expect(mocks.actionDb).toHaveBeenCalledOnce();
  expect(html).toContain('테스트 PG');
  expect(html).toContain('value="2.5"');
  expect(html).toContain('기준 판본');
  expect(html).toContain('>3</span>');
});

it('관리자 인증이 실패하면 PG 목록과 요율을 읽지 않는다', async () => {
  mocks.requireAdminSession.mockRejectedValue(new Error('UNAUTHENTICATED'));
  await expect(AgreementRatesPage({ searchParams: Promise.resolve({ pg: pgId }) })).rejects.toThrow('UNAUTHENTICATED');
  expect(mocks.listSellers).not.toHaveBeenCalled();
  expect(mocks.actionDb).not.toHaveBeenCalled();
});
