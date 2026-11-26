import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { requireAdminPermission } from '@/lib/auth/admin-session';
import { GET } from './route';

vi.mock('@/lib/auth/admin-session', () => ({ requireAdminPermission: vi.fn() }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => ({ value: 'verified-test-session' }) }) }));

describe('마케팅툴 세션 확인', () => {
  const request = (key = 'test-key') => new Request('http://localhost/api/marketing/session', {
    headers: { 'x-admin-marketing-token': key },
  });
  beforeEach(() => vi.stubEnv('ADMIN_MARKETING_INTERNAL_TOKEN', 'test-key'));
  afterEach(() => vi.unstubAllEnvs());

  it('서버 내부에서 보낸 요청만 확인한다', async () => {
    const response = await GET(request('unknown'));
    expect(response.status).toBe(404);
    expect(requireAdminPermission).not.toHaveBeenCalled();
  });

  it('마케팅 권한을 확인한 관리자와 해당 로그인에 묶인 값만 반환한다', async () => {
    vi.mocked(requireAdminPermission).mockResolvedValueOnce({
      adminId: 'editor@example.test', adminUserId: 'admin-id', role: 'operator',
    });
    const response = await GET(request());
    expect(requireAdminPermission).toHaveBeenCalledWith('marketing.manage');
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(await response.json()).toEqual({
      id: 'admin-id', email: 'editor@example.test',
      binding: createHash('sha256').update('verified-test-session').digest('hex'),
    });
  });

  it('로그인·2단계 인증·권한 검사에서 거절되면 계정 정보를 반환하지 않는다', async () => {
    vi.mocked(requireAdminPermission).mockRejectedValueOnce(new Error('PermissionDenied'));
    await expect(GET(request())).rejects.toThrow('PermissionDenied');
  });
});
