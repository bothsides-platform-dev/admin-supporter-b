// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PgStatusRow } from '@/lib/server/queries/admin/pgStatus';
import PgStatusPage from '../page';
import RfpsPage from '../../rfps/page';

const load = vi.hoisted(() => vi.fn());
vi.mock('@/lib/server/queries/admin/pgStatus', () => ({ listPgStatusPage: load }));
vi.mock('@/lib/server/queries/admin/rfps', () => ({
  listAllRfpsPage: async () => ({ rows: [], page: 1, total: 0 }),
}));
afterEach(cleanup);

describe('PG사별 현황 탭', () => {
  it('RFP 목록에서 탭으로 이동해 PG사와 다음 마감 RFP의 응답표를 열 수 있다', async () => {
    const list = render(await RfpsPage({ searchParams: Promise.resolve({}) }));
    const listTabs = within(screen.getByRole('navigation', { name: 'RFP 보기' }));
    expect(listTabs.getByRole('link', { name: 'RFP 목록' }).getAttribute('aria-current')).toBe('page');
    expect(listTabs.getByRole('link', { name: 'PG사별 현황' }).getAttribute('href')).toBe('/pg-status');
    list.unmount();

    const row: PgStatusRow = {
      id: 'pg-1', name: '가페이', invited: 10, unopened: 1, openedWithoutBid: 2, submitted: 4, withdrawn: 3,
      lastSentAt: new Date('2026-09-01T15:00:00Z'),
      nextRfp: { id: 'rfp-2', title: '쇼핑몰 정기 결제', deadline: new Date('2026-09-03T06:00:00Z') },
    };
    load.mockResolvedValueOnce({ rows: [row], total: 26, page: 1, sort: 'deadline' });
    render(await PgStatusPage({ searchParams: Promise.resolve({ q: ['페이', '다른 이름'], from: '2026-08-01' }) }));
    expect(load).toHaveBeenCalledWith(expect.objectContaining({ q: '페이', from: '2026-08-01' }));
    const tabs = within(screen.getByRole('navigation', { name: 'RFP 보기' }));
    expect(tabs.getByRole('link', { name: 'PG사별 현황' }).getAttribute('aria-current')).toBe('page');
    expect(tabs.getByRole('link', { name: 'RFP 목록' }).getAttribute('href')).toBe('/rfps');
    const table = within(screen.getByRole('table', { name: 'PG사별 RFP 응답 현황' }));
    const company = within(table.getByRole('row', { name: /가페이/ }));
    const seller = new URL((company.getByRole('link', { name: '가페이' }) as HTMLAnchorElement).href);
    expect(seller.pathname).toBe('/sellers/pg-1');
    expect(company.getAllByRole('cell').slice(1, 6).map((cell) => cell.textContent)).toEqual(['10', '1', '2', '4', '3']);
    const rfp = new URL((company.getByRole('link', { name: '쇼핑몰 정기 결제' }) as HTMLAnchorElement).href);
    expect([rfp.pathname, rfp.hash]).toEqual(['/rfps/rfp-2', '#pg-response-pg-1']);
    const returnTo = rfp.searchParams.get('returnTo');
    expect(seller.searchParams.get('returnTo')).toBe(returnTo);
    const back = new URL(returnTo!, 'http://localhost');
    expect(back.pathname).toBe('/pg-status');
    expect(Object.fromEntries(back.searchParams)).toMatchObject({ q: '페이', from: '2026-08-01', sort: 'deadline' });
    const next = new URL(screen.getByRole('link', { name: '다음' }).getAttribute('href')!, 'http://localhost');
    expect(Object.fromEntries(next.searchParams)).toMatchObject({ q: '페이', from: '2026-08-01', sort: 'deadline', page: '2' });
  });

  it('PG사명 검색 결과가 없으면 필터를 초기화할 수 있다', async () => {
    load.mockResolvedValueOnce({ rows: [], total: 0, page: 1, sort: 'name' });
    render(await PgStatusPage({ searchParams: Promise.resolve({ q: '없는 회사', sort: 'name' }) }));
    expect(screen.getByText('검색한 이름과 일치하는 PG사가 없습니다.')).toBeDefined();
    expect(screen.getByRole('link', { name: '필터 초기화' }).getAttribute('href')).toBe('/pg-status?sort=name');
  });
});
