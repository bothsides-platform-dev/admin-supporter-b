import { expect, it } from 'vitest';
import { normalizeBizNo } from './biz-no';

it('허용한 구분자만 지우고 체크섬이 맞는 10자리 번호를 숫자열로 돌려준다', () => {
  for (const value of ['1234567891', '123-45-67891', '123 45 67891', '123.45.67891', '123/45/67891', '123–45–67891', '123－45－67891']) {
    expect(normalizeBizNo(value)).toBe('1234567891');
  }
  expect(normalizeBizNo('220-81-12341')).toBe('2208112341');
});

it('체크섬이 틀리거나 자릿수·문자가 맞지 않으면 null을 돌려준다', () => {
  for (const value of [null, undefined, '', '123-45-67890', '123-45-6789', '123-45-678911', '123-45-6789\u200b1', '123-45-6789a1', '１２３-45-67891']) {
    expect(normalizeBizNo(value)).toBeNull();
  }
});
