// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import * as Browser from '../RegisteredIndustryBrowser';
afterEach(cleanup);
it('필터를 바꿔도 편집 폼 값과 조회 전용 상태를 유지한다', () => {
 const Component = Browser.RegisteredIndustryBrowser;
 const entries=[{id:'book',name:'서적 판매',mccCode:'5942',content:<fieldset disabled><input aria-label="이름" defaultValue="원래 이름" /></fieldset>},{id:'other',name:'방문 돌봄',mccCode:null,content:<input aria-label="메모" defaultValue="" />}];
 render(<Component entries={entries} />);
 fireEvent.click(screen.getByRole('button',{name:'기타 업종'}));
 fireEvent.change(screen.getByRole('textbox',{name:'메모'}),{target:{value:'작성 중'}});
 fireEvent.click(screen.getByRole('button',{name:'전체 카테고리'}));
 fireEvent.change(screen.getByRole('searchbox'),{target:{value:'서점'}});
 expect((screen.getByRole('textbox',{name:'이름'}).closest('fieldset') as HTMLFieldSetElement).disabled).toBe(true);
 fireEvent.click(screen.getByRole('button',{name:'검색 초기화'}));
 fireEvent.click(screen.getByRole('button',{name:'기타 업종'}));
 expect((screen.getByRole('textbox',{name:'메모'}) as HTMLInputElement).value).toBe('작성 중');
});

it('분류표에 없는 등록 업종은 기존 이름으로 기타 업종에 표시한다', () => {
 const Component = Browser.RegisteredIndustryBrowser;
 const entries=[{id:'unknown',name:'특수 장비 대여',mccCode:'9999',content:<input aria-label="메모" defaultValue="" />}];
 render(<Component entries={entries} />);
 fireEvent.click(screen.getByRole('button',{name:'기타 업종'}));
 expect(screen.getByRole('heading',{name:'특수 장비 대여'})).toBeTruthy();
});

it('등록 업종을 저장 이름·예시·MCC 코드로 검색하고 빈 결과를 안내한다', () => {
 const Component = Browser.RegisteredIndustryBrowser;
 const entries=[{id:'book',name:'서적 판매',mccCode:'5942',content:<input aria-label="메모" defaultValue="" />}];
 render(<Component entries={entries} />);
 const search=screen.getByRole('searchbox');
 for(const query of ['서적 판매','종이책','5942']) {
  fireEvent.change(search,{target:{value:query}});
  expect(screen.getByRole('heading',{name:'책·도서'})).toBeTruthy();
 }
 fireEvent.change(search,{target:{value:'해당하지 않는 업종'}});
 expect(screen.getByRole('status').textContent).toContain('검색 결과가 없어요');
 expect(screen.queryByRole('heading',{name:'책·도서'})).toBeNull();
});

it('카테고리 안에서 다른 카테고리 업종을 검색하고 초기화하면 원래 목록으로 돌아온다', () => {
 const Component = Browser.RegisteredIndustryBrowser;
 const entries=[{id:'book',name:'서적 판매',mccCode:'5942',content:<input aria-label="책 메모" defaultValue="" />},{id:'learn',name:'원격 교육',mccCode:'8241',content:<input aria-label="교육 메모" defaultValue="" />}];
 render(<Component entries={entries} />);
 fireEvent.click(screen.getByRole('button',{name:'책·문구·취미'}));
 fireEvent.change(screen.getByRole('searchbox'),{target:{value:'원격 교육'}});
 expect(screen.getByRole('heading',{name:'온라인 교육'})).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'검색 초기화'}));
 expect(screen.getByRole('heading',{name:'책·도서'})).toBeTruthy();
 expect(screen.queryByRole('heading',{name:'온라인 교육'})).toBeNull();
});
