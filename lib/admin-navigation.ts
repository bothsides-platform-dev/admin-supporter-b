import type { AdminPermission } from './auth/permissions';
/** 메뉴 옆에 대기 건수를 붙일 항목의 키. */
export type AdminNavigationCountKey = 'review' | 'nameChange' | 'pgMembers';
export type AdminNavigationCounts = Partial<Record<AdminNavigationCountKey, number>>;
export type AdminNavigationItem = { href: string; label: string; permission: AdminPermission; countKey?: AdminNavigationCountKey };
export const ADMIN_NAVIGATION: { label: string; items: AdminNavigationItem[] }[] = [
  { label: '운영 현황', items: [
    { href: '/', label: '대시보드', permission: 'data.view' },
    { href: '/tasks', label: '후속 업무', permission: 'data.view' },
    { href: '/search', label: '고객 검색', permission: 'data.view' },
    { href: '/metrics', label: '핵심 지표', permission: 'data.view' },
    { href: '/consultations', label: 'PG 상담 배정·지연', permission: 'data.view' },
    { href: '/pg-status', label: 'PG사별 현황', permission: 'data.view' },
    { href: '/observability', label: '시스템 관측', permission: 'observability.view' },
    { href: '/guest-journeys', label: '견적 작성 여정', permission: 'data.view' },
  ] },
  { label: '심사 업무', items: [
    { href: '/review', label: '입점 심사', permission: 'data.view', countKey: 'review' },
    { href: '/name-change-requests', label: '이름 변경 심사', permission: 'data.view', countKey: 'nameChange' },
    { href: '/admin/pg-members', label: 'PG 담당자 승인', permission: 'data.view', countKey: 'pgMembers' },
  ] },
  { label: '데이터 관리', items: [
    { href: '/users', label: '회원', permission: 'data.view' },
    { href: '/buyers', label: '구매사', permission: 'data.view' },
    { href: '/sellers', label: '판매사', permission: 'data.view' },
    { href: '/rfps', label: 'RFP', permission: 'data.view' },
  ] },
  { label: '운영 설정', items: [
    { href: '/pg-recommendations', label: 'PG 추천 기준', permission: 'data.view' },
    { href: '/instant-quotes', label: 'PG 즉시 가입 견적', permission: 'data.view' },
    { href: '/agreement-rates', label: '장기합의서 수수료 기준', permission: 'data.view' },
    { href: '/audit-log', label: '감사 로그', permission: 'audit.view' },
    { href: '/admins', label: '관리자 계정', permission: 'admin.manage' },
    { href: '/passkeys', label: '내 패스키', permission: 'data.view' },
  ] },
];
