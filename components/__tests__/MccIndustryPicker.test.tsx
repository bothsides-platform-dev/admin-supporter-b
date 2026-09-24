import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { MccIndustryPicker } from '../MccIndustryPicker';
it('이미 등록된 코드와 이름은 중복 선택을 막고 검색과 선택 제출을 제공한다', () => {
  const html = renderToStaticMarkup(<MccIndustryPicker action={async () => {}} registered={[{ mccCode: '5651', name: '기존 의류' }, { mccCode: null, name: '화장품 판매' }]} />);
  expect(html).toContain('업종 이름 또는 MCC 코드 검색');
  expect(html).toMatch(/<input[^>]*disabled=""[^>]*value="5651"/);
  expect(html).toMatch(/<input[^>]*disabled=""[^>]*value="5977"/);
  expect(html).toContain('선택한 업종 등록');
});
