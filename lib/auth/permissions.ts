/** Shared by navigation, form visibility and server actions. */
export const ADMIN_PERMISSIONS = [
  'data.view', 'audit.view', 'workspace.review', 'workspace.manage',
  'user.manage', 'notes.write', 'rfp.manage', 'recommendation.edit',
  'agreement_rates.edit', 'workspace.delete', 'user.delete',
] as const;
export type AdminPermission = typeof ADMIN_PERMISSIONS[number];
export type AdminRole = 'viewer' | 'reviewer' | 'finance' | 'operator' | 'super_admin';
const READ: AdminPermission[] = ['data.view', 'audit.view'];
export const ROLE_PERMISSIONS: Record<AdminRole, readonly AdminPermission[]> = {
  viewer: READ,
  reviewer: [...READ, 'workspace.review', 'notes.write'],
  finance: [...READ, 'agreement_rates.edit', 'recommendation.edit'],
  operator: ADMIN_PERMISSIONS.filter(p => !p.endsWith('.delete')),
  super_admin: ADMIN_PERMISSIONS,
};
export const ROLE_LABELS: Record<AdminRole, string> = {
  viewer: '조회 담당자', reviewer: '심사 담당자', finance: '수수료 담당자',
  operator: '운영자', super_admin: '최고 관리자',
};
export function hasPermission(session: { role: AdminRole }, permission: AdminPermission): boolean {
  return ROLE_PERMISSIONS[session.role]?.includes(permission) ?? false;
}
/** Reserved for future role assignment; not used by the current session policy.
 * Invalid explicit configuration fails closed to viewer. Allowlist is checked separately. */
export function assignedRole(email: string, configuration: string | undefined): Exclude<AdminRole, 'super_admin'> {
  if (!configuration?.trim()) return 'operator';
  try {
    const entries: unknown = JSON.parse(configuration);
    if (!entries || typeof entries !== 'object' || Array.isArray(entries)) return 'viewer';
    const role = Object.entries(entries).find(([key]) => key.trim().toLowerCase() === email.toLowerCase())?.[1];
    if (role === undefined) return 'operator';
    return role === 'operator' || role === 'reviewer' || role === 'finance' || role === 'viewer' ? role : 'viewer';
  } catch { return 'viewer'; }
}
