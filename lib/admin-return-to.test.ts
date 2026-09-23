import { expect, it } from 'vitest';
import { safeListReturnTo } from './admin-return-to';

it('목록 검색 조건만 복귀 경로에 보존한다', () => {
  expect(safeListReturnTo('/buyers?status=active&page=2', '/buyers')).toBe('/buyers?status=active&page=2');
  for (const unsafe of ['//evil.example', 'https://evil.example/buyers', '/buyers/other', '/buyers#fragment', '/buyers%2f..%2fusers']) {
    expect(safeListReturnTo(unsafe, '/buyers')).toBe('/buyers');
  }
});
