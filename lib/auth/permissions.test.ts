import { describe, expect, it, vi, beforeEach } from 'vitest';
import { assignedRole, hasPermission } from './permissions';
const mocks = vi.hoisted(() => ({ auth: vi.fn() }));
vi.mock('@/auth', () => ({ auth: mocks.auth }));
vi.mock('next/navigation', () => ({ redirect: (url: string) => { throw new Error(`REDIRECT:${url}`); } }));
import { requireAdminPermission, requireAdminSession } from './admin-session';
beforeEach(() => {
  vi.unstubAllEnvs();
  mocks.auth.mockResolvedValue({ user: { email: 'ops@example.com' } });
  vi.stubEnv('ADMIN_EMAILS', 'ops@example.com');
  vi.stubEnv('ADMIN_SUPER_EMAILS', '');
  vi.stubEnv('ADMIN_ROLE_ASSIGNMENTS', '{}');
});
describe('역할별 권한', () => {
  it('조회 담당자는 수정할 수 없고 심사와 요율 권한은 분리된다', () => {
    expect(hasPermission({ role: 'viewer' }, 'data.view')).toBe(true);
    expect(hasPermission({ role: 'viewer' }, 'workspace.review')).toBe(false);
    expect(hasPermission({ role: 'reviewer' }, 'workspace.review')).toBe(true);
    expect(hasPermission({ role: 'reviewer' }, 'agreement_rates.edit')).toBe(false);
    expect(hasPermission({ role: 'finance' }, 'workspace.review')).toBe(false);
    expect(hasPermission({ role: 'finance' }, 'agreement_rates.edit')).toBe(true);
    expect(hasPermission({ role: 'operator' }, 'user.delete')).toBe(false);
    expect(hasPermission({ role: 'operator' }, 'rfp.delete')).toBe(false);
    expect(hasPermission({ role: 'super_admin' }, 'rfp.delete')).toBe(true);
    expect(hasPermission({ role: 'super_admin' }, 'user.delete')).toBe(true);
  });
  it('향후 역할 파서는 미지정 계정을 운영자로, 잘못된 설정을 조회로 제한한다', () => {
    expect(assignedRole('ops@example.com', undefined)).toBe('operator');
    expect(assignedRole('ops@example.com', '{')).toBe('viewer');
    expect(assignedRole('ops@example.com', '{"ops@example.com":"super_admin"}')).toBe('viewer');
    expect(assignedRole('ops@example.com', '{"OPS@EXAMPLE.COM":"reviewer"}')).toBe('reviewer');
  });
  it('역할 설정만으로 로그인 허용 목록을 우회할 수 없다', async () => {
    vi.stubEnv('ADMIN_EMAILS', '');
    vi.stubEnv('ADMIN_ROLE_ASSIGNMENTS', '{"ops@example.com":"operator"}');
    await expect(requireAdminSession()).rejects.toThrow('/login?error=AccessDenied');
  });
  it('허용된 관리자는 별도 설정 없이 최고 관리자 권한을 가진다', async () => {
    await expect(requireAdminSession()).resolves.toEqual({ adminId: 'ops@example.com', role: 'super_admin' });
    await expect(requireAdminPermission('workspace.delete')).resolves.toMatchObject({ role: 'super_admin' });
    await expect(requireAdminPermission('user.delete')).resolves.toMatchObject({ role: 'super_admin' });
  });
  it('기존 역할 환경변수가 남아 있어도 모두 최고 관리자로 동작한다', async () => {
    vi.stubEnv('ADMIN_SUPER_EMAILS', 'someone-else@example.com');
    vi.stubEnv('ADMIN_ROLE_ASSIGNMENTS', '{"ops@example.com":"viewer"}');
    await expect(requireAdminSession()).resolves.toMatchObject({ role: 'super_admin' });
    await expect(requireAdminPermission('workspace.review')).resolves.toMatchObject({ role: 'super_admin' });
  });
  it('로그인하지 않은 사용자는 관리자 권한을 얻지 못한다', async () => {
    mocks.auth.mockResolvedValue(null);
    await expect(requireAdminSession()).rejects.toThrow('REDIRECT:/login');
  });
});
