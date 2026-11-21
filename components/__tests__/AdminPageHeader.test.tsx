// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { AdminPageHeader } from '../AdminPageHeader';

afterEach(cleanup);

describe('AdminPageHeader', () => {
  it('목록 화면은 제목만 보여 주고 경로 내비게이션을 만들지 않는다', () => {
    render(<AdminPageHeader title="구매사" />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('구매사');
    expect(screen.queryByRole('navigation')).toBeNull();
  });

  it('상세 화면은 목록으로 돌아가는 경로와 현재 위치를 알린다', () => {
    render(<AdminPageHeader title="테스트 상사" breadcrumbs={[{ label: '구매사', href: '/buyers?status=active' }]} />);
    const nav = screen.getByRole('navigation', { name: '현재 위치' });
    expect(within(nav).getByRole('link', { name: '구매사' }).getAttribute('href')).toBe('/buyers?status=active');
    const current = nav.querySelector('[aria-current="page"]');
    expect(current?.textContent).toBe('테스트 상사');
  });

  it('상태 표시·설명·페이지 액션을 함께 그린다', () => {
    render(
      <AdminPageHeader title="입점 심사" description="안내 문구" badges={<span>심사 중</span>}>
        <a href="https://example.com">외부 조회</a>
      </AdminPageHeader>,
    );
    expect(screen.getByText('심사 중')).toBeDefined();
    expect(screen.getByText('안내 문구')).toBeDefined();
    expect(screen.getByRole('link', { name: '외부 조회' })).toBeDefined();
  });
});
