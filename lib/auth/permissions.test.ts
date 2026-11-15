import { describe, expect, it } from 'vitest';
import { assignedRole, hasPermission } from './permissions';
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
  it('관리자 계정 관리는 최고 관리자에게만 있다', () => {
    expect(hasPermission({ role: 'super_admin' }, 'admin.manage')).toBe(true);
    expect(hasPermission({ role: 'operator' }, 'admin.manage')).toBe(false);
    expect(hasPermission({ role: 'reviewer' }, 'admin.manage')).toBe(false);
  });
  it('향후 역할 파서는 미지정 계정을 운영자로, 잘못된 설정을 조회로 제한한다', () => {
    expect(assignedRole('ops@example.com', undefined)).toBe('operator');
    expect(assignedRole('ops@example.com', '{')).toBe('viewer');
    expect(assignedRole('ops@example.com', '{"ops@example.com":"super_admin"}')).toBe('viewer');
    expect(assignedRole('ops@example.com', '{"OPS@EXAMPLE.COM":"reviewer"}')).toBe('reviewer');
  });
});
