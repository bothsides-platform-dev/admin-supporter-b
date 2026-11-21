// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { AdminListControls } from '../AdminListControls';
import { AdminDataTable } from '../AdminDataTable';

afterEach(cleanup);

const VIEWS = [{ value: '', label: '전체' }, { value: 'active', label: '활성' }, { value: 'suspended', label: '정지' }];

describe('AdminListControls 상태별 보기', () => {
  it('탭은 상태만 바꾸고 검색·기간·정렬은 유지하며 페이지는 처음으로 돌린다', () => {
    render(<AdminListControls path="/buyers" params={{ q: '상사', status: 'active', sort: 'name', page: '3' }} statusViews={VIEWS}><input name="q" /></AdminListControls>);
    const nav = screen.getByRole('navigation', { name: '상태별 보기' });
    expect(within(nav).getByRole('link', { name: '정지' }).getAttribute('href')).toBe('/buyers?q=%EC%83%81%EC%82%AC&status=suspended&sort=name');
    expect(within(nav).getByRole('link', { name: '전체' }).getAttribute('href')).toBe('/buyers?q=%EC%83%81%EC%82%AC&sort=name');
    expect(within(nav).getByRole('link', { name: '활성' }).getAttribute('aria-current')).toBe('page');
    expect(within(nav).getByRole('link', { name: '전체' }).getAttribute('aria-current')).toBeNull();
  });

  it('검색 폼은 보던 탭의 상태를 hidden 값으로 함께 보낸다', () => {
    const { container } = render(<AdminListControls path="/buyers" params={{ status: 'active' }} statusViews={VIEWS}><input name="q" /></AdminListControls>);
    expect(container.querySelector<HTMLInputElement>('input[type="hidden"][name="status"]')?.value).toBe('active');
  });

  it('탭 주소는 viewParams 를 쓰므로 페이지가 풀어 넣은 기본 정렬이 다른 탭으로 따라가지 않는다', () => {
    render(
      <AdminListControls path="/review" params={{ status: 'open', sort: 'oldest' }} viewParams={{ status: 'open' }} statusViews={[{ value: 'open', label: '처리 대기' }, { value: 'approved', label: '승인' }]}>
        <input name="q" />
      </AdminListControls>,
    );
    expect(screen.getByRole('link', { name: '승인' }).getAttribute('href')).toBe('/review?status=approved');
  });
});

describe('AdminListControls 적용된 필터', () => {
  it('필터가 없으면 칩 영역을 그리지 않는다', () => {
    render(<AdminListControls path="/buyers" params={{ status: 'active', sort: 'name' }} statusViews={VIEWS}><input name="q" /></AdminListControls>);
    expect(screen.queryByRole('list', { name: '적용된 필터' })).toBeNull();
  });

  it('칩 하나를 지우면 그 필터와 페이지 번호만 빠지고 상태·정렬은 남는다', () => {
    render(
      <AdminListControls path="/review" params={{ q: '상사', type: 'pg', from: '2026-09-01', status: 'open', sort: 'oldest', page: '2' }} dateLabel="신청일" extraFilters={[{ key: 'type', label: '유형', value: 'PG사' }]}>
        <input name="q" />
      </AdminListControls>,
    );
    const chips = screen.getByRole('list', { name: '적용된 필터' });
    const href = within(chips).getByRole('link', { name: '유형 PG사 필터 지우기' }).getAttribute('href') ?? '';
    expect(Object.fromEntries(new URL(href, 'http://admin.local').searchParams)).toEqual({ q: '상사', status: 'open', from: '2026-09-01', sort: 'oldest' });
    expect(within(chips).getByRole('link', { name: '신청일 시작 2026-09-01 필터 지우기' })).toBeDefined();
    expect(within(chips).getByRole('link', { name: '필터 모두 지우기' }).getAttribute('href')).toBe('/review?status=open&sort=oldest');
  });

  it('필터가 하나뿐이면 "모두 지우기"를 따로 두지 않는다', () => {
    render(<AdminListControls path="/buyers" params={{ q: '상사' }}><input name="q" /></AdminListControls>);
    expect(screen.getByRole('link', { name: '검색 상사 필터 지우기' }).getAttribute('href')).toBe('/buyers');
    expect(screen.queryByRole('link', { name: '필터 모두 지우기' })).toBeNull();
  });
});

describe('AdminDataTable 빈 상태 액션', () => {
  it('빈 상태에 다음 행동 링크를 함께 보여 준다', () => {
    render(<AdminDataTable caption="표" rows={[]} getKey={() => 'x'} emptyMessage="검색 조건에 맞는 항목이 없습니다." emptyAction={{ label: '필터 초기화', href: '/buyers?status=active' }} columns={[{ key: 'a', label: 'A', render: () => null }]} />);
    expect(screen.getByRole('link', { name: '필터 초기화' }).getAttribute('href')).toBe('/buyers?status=active');
  });
});
