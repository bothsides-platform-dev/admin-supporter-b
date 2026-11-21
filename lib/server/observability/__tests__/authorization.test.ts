import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getObservability, InvalidFilters, QueryLimit } from '../index';
import { hasPermission } from '@/lib/auth/permissions';

vi.mock('server-only', () => ({}));
const mocks = vi.hoisted(() => ({ permission: vi.fn(), metrics: vi.fn() }));
vi.mock('@/lib/auth/admin-session', () => ({ requireAdminPermission: mocks.permission }));
vi.mock('../metrics', () => ({ loadMetrics: mocks.metrics }));

beforeEach(() => {
  mocks.permission.mockReset().mockResolvedValue({ adminUserId: randomUUID() });
  mocks.metrics.mockReset().mockResolvedValue([]);
});
describe('observability authorization and budgets', () => {
  it('세션·TOTP·권한 검사를 입력 검증과 외부 조회보다 먼저 실행한다', async () => {
    const denial = new Error('NEXT_REDIRECT to 2fa');
    mocks.permission.mockRejectedValue(denial);
    await expect(getObservability({ range: 'invalid' })).rejects.toBe(denial);
    expect(mocks.permission).toHaveBeenCalledWith('observability.view');
    expect(mocks.metrics).not.toHaveBeenCalled();
  });
  it('일반 조회 역할에는 관측 권한을 주지 않는다', () => {
    expect(hasPermission({ role: 'viewer' }, 'observability.view')).toBe(false);
    expect(hasPermission({ role: 'operator' }, 'observability.view')).toBe(true);
  });
  it('잘못된 입력은 외부 조회 없이 거부한다', async () => {
    await expect(getObservability({ q: 'x'.repeat(121) })).rejects.toBeInstanceOf(InvalidFilters);
    expect(mocks.metrics).not.toHaveBeenCalled();
  });
  it('동일 관리자 동시 조회를 두 개로 제한하고 완료 후 해제한다', async () => {
    let release!: () => void;
    const pending = new Promise<void>(resolve => { release = resolve; });
    mocks.metrics.mockImplementation(async () => { await pending; return []; });
    const first = getObservability({}), second = getObservability({});
    await expect(getObservability({})).rejects.toBeInstanceOf(QueryLimit);
    release(); await Promise.all([first, second]);
    await expect(getObservability({})).resolves.toMatchObject({ metrics: [] });
  });
  it('한 관리자에게 분당 20회 조회 예산을 적용한다', async () => {
    for (let i = 0; i < 20; i++) await getObservability({});
    await expect(getObservability({})).rejects.toBeInstanceOf(QueryLimit);
  });
});
