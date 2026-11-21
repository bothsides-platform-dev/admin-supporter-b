import { expect, it } from 'vitest';
import { safeListReturnTo } from './admin-return-to';

it('목록 검색 조건만 복귀 경로에 보존한다', () => {
  expect(safeListReturnTo('/buyers?status=active&page=2', '/buyers')).toBe('/buyers?status=active&page=2');
  for (const unsafe of ['//evil.example', 'https://evil.example/buyers', '/buyers/other', '/buyers#fragment', '/buyers%2f..%2fusers']) {
    expect(safeListReturnTo(unsafe, '/buyers')).toBe('/buyers');
  }
});

it('PG사별 현황의 검색 조건은 연결된 판매사와 RFP 상세에서 복원한다', () => {
  const list = '/pg-status?q=pay&from=2026-09-01&sort=deadline&page=2';
  expect(safeListReturnTo(list, '/sellers')).toBe(list);
  expect(safeListReturnTo(list, '/rfps')).toBe(list);
  expect(safeListReturnTo(list, '/buyers')).toBe('/buyers');
  expect(safeListReturnTo('/pg-status/other', '/rfps')).toBe('/rfps');
});
