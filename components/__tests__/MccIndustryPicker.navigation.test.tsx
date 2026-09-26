// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MccIndustryPicker } from '../MccIndustryPicker';
afterEach(cleanup);
it('카테고리별 미등록 선택을 누적하고 동의어는 전체에서 찾는다', () => {
 const {container}=render(<MccIndustryPicker action={async()=>{}} registered={[{mccCode:'5942',name:'서적 판매'}]} />);
 fireEvent.click(screen.getByRole('button',{name:'책·문구·취미'}));
 expect((screen.getByRole('checkbox',{name:/책·도서/}) as HTMLInputElement).disabled).toBe(true);
 fireEvent.click(screen.getByRole('button',{name:'현재 목록 모두 선택'}));
 fireEvent.change(screen.getByRole('searchbox'),{target:{value:'인강'}});
 fireEvent.click(screen.getByRole('checkbox',{name:/온라인 교육/}));
 const codes=Array.from(container.querySelectorAll<HTMLInputElement>('input[name="mccCodes"]')).map(x=>x.value);
 expect(codes).toContain('8241'); expect(codes).toContain('5943'); expect(codes).not.toContain('5942');
 fireEvent.click(screen.getByRole('button',{name:'검색 초기화'}));
 expect((screen.getByRole('checkbox',{name:/문구/}) as HTMLInputElement).checked).toBe(true);
 fireEvent.click(screen.getByRole('button',{name:'전체 카테고리'}));
 expect(screen.queryByRole('checkbox')).toBeNull();
});

it('기존 MCC 이름·예시·코드로 검색하고 결과 없음 상태를 보여준다', () => {
 render(<MccIndustryPicker action={async()=>{}} registered={[]} />);
 const search=screen.getByRole('searchbox');
 for(const query of ['서적 판매','종이책','5942']) {
  fireEvent.change(search,{target:{value:query}});
  expect(screen.getByRole('checkbox',{name:/책·도서/})).toBeTruthy();
 }
 fireEvent.change(search,{target:{value:'해당하지 않는 업종'}});
 expect(screen.getByText('검색 결과가 없어요. 다른 상품이나 서비스로 찾아봐요.')).toBeTruthy();
 expect(screen.queryByRole('checkbox')).toBeNull();
});
