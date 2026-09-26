// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { MccIndustryPicker } from '../MccIndustryPicker';
afterEach(cleanup);
it('등록된 코드와 기존 저장 이름 모두 중복 선택을 막는다', () => {
  render(<MccIndustryPicker action={async()=>{}} registered={[{mccCode:'5651',name:'기존 의류'},{mccCode:null,name:'화장품 판매'}]} />);
  fireEvent.click(screen.getByRole('button',{name:'패션·뷰티'}));
  expect((screen.getByRole('checkbox',{name:/의류/}) as HTMLInputElement).disabled).toBe(true);
  expect((screen.getByRole('checkbox',{name:/화장품/}) as HTMLInputElement).disabled).toBe(true);
});
