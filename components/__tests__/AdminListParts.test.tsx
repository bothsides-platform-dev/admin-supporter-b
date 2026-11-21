// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { AdminDataTable } from '../AdminDataTable';
import { AdminListPagination } from '../AdminListPagination';

afterEach(cleanup);

describe('AdminListPagination', () => {
  it('공통 목록 파라미터를 유지한 채 이전·다음 주소를 만든다', () => {
    render(<AdminListPagination path="/buyers" params={{ q: '상사', status: 'active' }} page={2} total={60} />);
    expect(screen.getByRole('link', { name: '이전' }).getAttribute('href')).toBe('/buyers?q=%EC%83%81%EC%82%AC&status=active&page=1');
    expect(screen.getByRole('link', { name: '다음' }).getAttribute('href')).toBe('/buyers?q=%EC%83%81%EC%82%AC&status=active&page=3');
    expect(screen.getByText('전체 60건, 26–50건 표시')).toBeDefined();
  });

  it('hrefFor 와 pageSize 를 주면 그 기준으로 주소와 범위를 계산한다', () => {
    render(<AdminListPagination path="/audit-log" page={1} total={120} pageSize={50} hrefFor={(page) => `/audit-log?actor=ops&page=${page}`} />);
    expect(screen.getByRole('link', { name: '다음' }).getAttribute('href')).toBe('/audit-log?actor=ops&page=2');
    expect(screen.queryByRole('link', { name: '이전' })).toBeNull();
    expect(screen.getByText('전체 120건, 1–50건 표시')).toBeDefined();
    expect(screen.getByText('1 / 3')).toBeDefined();
  });

  it('결과가 없으면 0건으로 표시하고 이동 링크를 만들지 않는다', () => {
    render(<AdminListPagination path="/buyers" params={{}} page={1} total={0} />);
    expect(screen.getByText('전체 0건, 0–0건 표시')).toBeDefined();
    expect(screen.queryAllByRole('link')).toHaveLength(0);
  });
});

describe('AdminDataTable', () => {
  const rows = [{ id: 'a', name: '가' }];

  it('숨긴 머리글도 보조 기술에 읽히고 셀·행 클래스를 적용한다', () => {
    render(
      <AdminDataTable
        caption="표" rows={rows} getKey={(row) => row.id} emptyMessage="없음" rowClassName="align-top"
        columns={[
          { key: 'name', label: '이름', cellClassName: 'whitespace-nowrap', render: (row) => row.name },
          { key: 'actions', label: '관리', hideLabel: true, render: () => <button type="button">제외</button> },
        ]}
      />,
    );
    expect(screen.getByRole('columnheader', { name: '관리' }).querySelector('.sr-only')).not.toBeNull();
    const cell = screen.getByRole('cell', { name: '가' });
    expect(cell.className).toContain('whitespace-nowrap');
    expect(cell.closest('tr')?.className).toContain('align-top');
  });

  it('행이 없으면 모든 열에 걸쳐 빈 상태를 보여 준다', () => {
    render(<AdminDataTable caption="표" rows={[]} getKey={() => 'x'} emptyMessage="없음" columns={[{ key: 'a', label: 'A', render: () => null }, { key: 'b', label: 'B', render: () => null }]} />);
    expect(screen.getByRole('cell', { name: '없음' }).getAttribute('colspan')).toBe('2');
  });
});
