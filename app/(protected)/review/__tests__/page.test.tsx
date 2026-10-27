import { isValidElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  detail: vi.fn(),
  list: vi.fn(),
  notFound: vi.fn(),
}));

vi.mock('@/lib/server/queries/admin/review', () => ({
  getApplicationDetail: mocks.detail,
  listApplicationsPage: mocks.list,
}));
vi.mock('@/lib/auth/admin-session', () => ({ requireAdminSession: vi.fn().mockResolvedValue({ adminId: 'ops@example.com', role: 'operator' }) }));
vi.mock('@/lib/auth/permissions', () => ({ hasPermission: vi.fn().mockReturnValue(true) }));
vi.mock('@/lib/server/actions/admin/approveWorkspaceAction', () => ({ approveWorkspaceAction: vi.fn() }));
vi.mock('@/lib/server/actions/admin/rejectWorkspaceAction', () => ({ rejectWorkspaceAction: vi.fn() }));
vi.mock('@/lib/server/actions/admin/requestMoreInfoAction', () => ({
  requestMoreInfoAction: vi.fn(),
  bulkRequestMoreInfoAction: vi.fn(),
}));
vi.mock('@/lib/server/queries/admin/nextReview', () => ({ getNextReviewApplicationId: vi.fn() }));
vi.mock('@/components/WorkspaceReviewInfo', () => ({ WorkspaceReviewInfo: () => null }));
vi.mock('next/navigation', () => ({ notFound: mocks.notFound, redirect: vi.fn() }));

import ReviewListPage from '../page';
import ReviewDetailPage from '../[id]/page';

type ElementProps = Record<string, unknown> & { children?: ReactNode };

function textOf(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (!isValidElement(node)) return '';
  return textOf((node.props as ElementProps).children);
}

function externalLinks(node: ReactNode): Array<{ href: unknown; text: string }> {
  if (Array.isArray(node)) return node.flatMap(externalLinks);
  if (!isValidElement(node)) return [];
  const props = node.props as ElementProps;
  const own = node.type === 'a' && props.target === '_blank' ? [{ href: props.href, text: textOf(props.children) }] : [];
  return [...own, ...externalLinks(props.children)];
}

function detail(overrides: Record<string, unknown> = {}) {
  return {
    application: { id: 'application-1', orgType: 'buyer', status: 'submitted', reviewedAt: null, reason: null },
    workspace: { id: 'workspace-1', name: '테스트 상사' },
    bizProfile: { bizNo: '123-45-67891', grade: null },
    pgProfile: null,
    ...overrides,
  };
}

async function renderDetail() {
  return ReviewDetailPage({
    params: Promise.resolve({ id: 'application-1' }),
    searchParams: Promise.resolve({}),
  });
}

beforeEach(() => {
  mocks.detail.mockReset();
  mocks.list.mockReset().mockResolvedValue({ rows: [], total: 0, page: 1 });
});

describe('입점 심사 사업자정보 조회 링크', () => {
  it('목록 화면은 비즈노 없이 머니핀과 페이투페이로 연결한다', async () => {
    const links = externalLinks(await ReviewListPage({ searchParams: Promise.resolve({}) }));

    expect(links).toEqual([
      { href: 'https://moneypin.biz/bizno/', text: '머니핀(사업자정보 조회)' },
      { href: 'https://www.pay2pay.co.kr/board/view?bId=faq&wr_id=3779', text: '페이투페이(사업자 등급 조회)' },
    ]);
  });

  it('상세 화면은 하이픈을 뺀 구매사 사업자번호의 머니핀 상세로 연결하고 비즈노는 표시하지 않는다', async () => {
    mocks.detail.mockResolvedValue(detail());
    const links = externalLinks(await renderDetail());

    expect(links).toEqual([
      { href: 'https://moneypin.biz/bizno/detail/1234567891/', text: '머니핀(사업자정보 조회)' },
      { href: 'https://www.pay2pay.co.kr/board/view?bId=faq&wr_id=3779', text: '페이투페이(사업자 등급 조회)' },
    ]);
  });

  it('PG사 신청은 PG 프로필의 사업자번호로 머니핀 상세를 연다', async () => {
    mocks.detail.mockResolvedValue(detail({
      application: { id: 'application-1', orgType: 'pg', status: 'submitted', reviewedAt: null, reason: null },
      bizProfile: { bizNo: '999-99-99999', grade: null },
      pgProfile: { bizNo: '220-81-12341' },
    }));
    const links = externalLinks(await renderDetail());

    expect(links[0]).toEqual({ href: 'https://moneypin.biz/bizno/detail/2208112341/', text: '머니핀(사업자정보 조회)' });
  });

  it('점·슬래시·대시로 구분한 사업자번호도 구분자를 빼고 머니핀 상세로 연결한다', async () => {
    for (const bizNo of ['123.45.67891', '123/45/67891', '123–45–67891']) {
      mocks.detail.mockResolvedValue(detail({ bizProfile: { bizNo, grade: null } }));
      const links = externalLinks(await renderDetail());

      expect(links[0]).toEqual({ href: 'https://moneypin.biz/bizno/detail/1234567891/', text: '머니핀(사업자정보 조회)' });
    }
  });

  it('사업자번호가 없거나 자릿수·체크섬·문자가 맞지 않으면 확인 필요 문구로 머니핀 조회 첫 화면에 연결한다', async () => {
    const invalid = [null, { bizNo: null, grade: 'sole' }, ...['123-45-6789', '123-45-678901', '123-45-67890', '123-45-6789\u200b1'].map((bizNo) => ({ bizNo, grade: null }))];
    for (const bizProfile of invalid) {
      mocks.detail.mockResolvedValue(detail({ bizProfile }));
      const links = externalLinks(await renderDetail());

      expect(links[0]).toEqual({ href: 'https://moneypin.biz/bizno/', text: '머니핀(사업자번호 확인 필요)' });
      expect(links.some((link) => String(link.href).includes('bizno.net'))).toBe(false);
    }
  });
});
