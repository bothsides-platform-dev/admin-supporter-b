import { beforeEach, expect, it, vi } from 'vitest';
import { redirect } from 'next/navigation';
import { GET } from './route';
import { InvalidFilters, QueryLimit } from '@/lib/server/observability';

const load = vi.hoisted(() => vi.fn());
vi.mock('@/lib/server/observability', () => ({ getObservability: load, InvalidFilters: class extends Error {}, QueryLimit: class extends Error {} }));
beforeEach(() => { load.mockReset(); });
const request = () => new Request('https://admin.example/api/observability?view=logs');

it('조회 결과를 공유 캐시에 저장하지 않는다', async () => {
  load.mockResolvedValue({ logs: { state: 'ready', data: [] } });
  const response = await GET(request());
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('private, no-store');
  expect(load).toHaveBeenCalledWith({ view: 'logs' });
});
it('잘못된 요청·조회 한도·내부 실패에 상태 코드를 구분한다', async () => {
  for (const [error, status] of [[new InvalidFilters(), 400], [new QueryLimit(), 429], [new Error('token=private'), 503]] as const) {
    load.mockRejectedValueOnce(error);
    const response = await GET(request());
    expect(response.status).toBe(status);
    expect(await response.text()).not.toContain('private');
    if (status === 429) expect(response.headers.get('retry-after')).toBe('60');
  }
});
it('인증/TOTP 리디렉트를 503으로 삼키지 않는다', async () => {
  load.mockImplementation(() => redirect('/login/2fa'));
  await expect(GET(request())).rejects.toMatchObject({ digest: expect.stringContaining('NEXT_REDIRECT') });
});
