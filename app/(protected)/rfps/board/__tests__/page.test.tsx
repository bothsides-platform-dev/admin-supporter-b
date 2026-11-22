// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import BoardPage from '../page';
import TasksPage from '../../../tasks/page';
import { safeListReturnTo } from '@/lib/admin-return-to';

vi.mock('next/navigation', async (load) => ({
  ...(await load<typeof import('next/navigation')>()),
  useRouter: () => ({ refresh: vi.fn() }),
}));

const { board, queue, session, owners, tasksContext } = vi.hoisted(() => ({
  board: vi.fn(),
  queue: vi.fn(),
  session: vi.fn(),
  owners: vi.fn(),
  tasksContext: vi.fn(),
}));
vi.mock('@/lib/server/queries/admin/rfpBoard', () => ({ getRfpBoard: board }));
vi.mock('@/lib/auth/admin-session', () => ({ requireAdminPermission: session }));
vi.mock('@/lib/server/queries/admin/followups', () => ({
  nextRfpFollowups: () => [],
  listFollowups: queue,
  getTaskContext: tasksContext,
  getTaskOwners: owners,
}));
vi.mock('@/lib/server/actions/admin/followups', () => ({ saveFollowupAction: vi.fn() }));
afterEach(cleanup);

it('보드에서 한 카드로 들어갔다가 필터로 복귀하며, 견적 기한 경과를 표시한다', async () => {
  board.mockResolvedValue([
    {
      id: 'one',
      code: 'P-2611-0001',
      title: '결제 교체',
      buyer: '구매사',
      pgNames: '가페이',
      stage: 'consulting',
      matching: true,
      overdue: true,
      deadline: '2026-01-15T00:00:00Z',
      event: '초대 열람',
      eventAt: '2026-01-02T00:00:00Z',
      total: 1,
      page: 1,
    },
  ]);
  render(await BoardPage({ searchParams: Promise.resolve({ q: '교체', pg: '페이' }) }));
  expect(screen.getByRole('link', { name: '신청 진행 보드' }).getAttribute('aria-current')).toBe('page');
  const card = screen.getByRole('link', { name: /결제 교체/ });
  const href = new URL(card.getAttribute('href')!, 'https://localhost');
  expect(href.pathname + href.hash).toBe('/rfps/one#consultations');
  expect(safeListReturnTo(href.searchParams.get('returnTo'), '/rfps')).toBe(
    href.searchParams.get('returnTo'),
  );
  expect(card.textContent).toContain('기한 경과');
});

it('조회 담당자에게 입력 폼을 노출하지 않고 운영자는 선택한 예외 대상에 등록한다', async () => {
  tasksContext.mockResolvedValue({
    rfpId: 'rfp',
    workspaceId: 'buyer',
    label: 'RFP',
    rounds: [{ key: 'delivery:item', label: 'PG · 마감 안내' }],
  });
  queue.mockResolvedValue({ rows: [], total: 0, page: 1, view: 'open' });
  session.mockResolvedValue({ role: 'viewer' });
  const params = { searchParams: Promise.resolve({ rfp: 'rfp', target: 'delivery:item' }) };
  const first = render(await TasksPage(params));
  expect(screen.queryByText('업무 등록')).toBeNull();
  expect(owners).not.toHaveBeenCalled();
  first.unmount();
  owners.mockResolvedValue([]);
  session.mockResolvedValue({ role: 'operator' });
  render(await TasksPage(params));
  expect((screen.getByLabelText('업무 유형') as HTMLSelectElement).value).toBe('delivery');
  expect((screen.getByLabelText('연결 대상') as HTMLSelectElement).value).toBe('delivery:item');
  expect(screen.getByLabelText('다음 연락 시각 (한국시간)')).toBeDefined();
});
