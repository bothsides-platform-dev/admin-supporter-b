import { expect, it } from 'vitest';
import { searchMccIndustries } from '../mcc-catalog';
it('관리자가 한국어 업종 이름과 코드로 같은 항목을 찾는다', () => {
  expect(searchMccIndustries('화장품').map(x => x.code)).toEqual(['5977']);
  expect(searchMccIndustries('5977').map(x => x.code)).toEqual(['5977']);
  expect(searchMccIndustries('  원격 교육 ').map(x => x.code)).toEqual(['8241']);
  expect(searchMccIndustries('없는검색어')).toEqual([]);
});
