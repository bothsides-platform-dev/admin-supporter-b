import type { AdminPermission } from './auth/permissions';
export type AdminNavigationItem = { href: string; label: string; permission: AdminPermission };
export const ADMIN_NAVIGATION: { label: string; items: AdminNavigationItem[] }[] = [
  { label: '운영 현황', items: [{ href: '/', label: '대시보드', permission: 'data.view' }] },
  { label: '심사 업무', items: [
    { href: '/review', label: '입점 심사', permission: 'data.view' },
    { href: '/name-change-requests', label: '이름 변경 심사', permission: 'data.view' },
    { href: '/admin/pg-members', label: 'PG 담당자 승인', permission: 'data.view' },
  ] },
  { label: '데이터 관리', items: [
    { href: '/users', label: '회원', permission: 'data.view' },
    { href: '/buyers', label: '구매사', permission: 'data.view' },
    { href: '/sellers', label: '판매사', permission: 'data.view' },
    { href: '/rfps', label: 'RFP', permission: 'data.view' },
  ] },
  { label: '운영 설정', items: [
    { href: '/pg-recommendations', label: 'PG 추천 기준', permission: 'data.view' },
    { href: '/agreement-rates', label: '장기합의서 수수료 기준', permission: 'data.view' },
    { href: '/audit-log', label: '감사 로그', permission: 'audit.view' },
  ] },
];
