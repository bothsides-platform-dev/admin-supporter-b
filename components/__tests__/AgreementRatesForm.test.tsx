import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
vi.mock('@/lib/server/actions/admin/agreementRates', () => ({ saveAgreementRatesAction: vi.fn() }));
import { AgreementRatesForm } from '../AgreementRatesForm';
it('관리자 입력은 표준 요율만 받고 퍼센트·정액 단위를 구분하며 미등록은 빈칸이다', () => {
  const html = renderToStaticMarkup(
    <AgreementRatesForm pgWsId="pg" version={0} rates={[{ key: 'bank_transfer', rate: 0.02 }]} />,
  );
  expect(html).toContain('기준 저장하기');
  expect(html).toContain('원/건');
  expect(html).toContain('카드 · 일반');
  expect(html).toContain('value="2"');
  expect(html).toContain('미등록');
  expect(html).not.toContain('최종 수수료 입력');
});
it('저장된 직접입력 라벨의 줄바꿈과 앞뒤 공백을 원문 그대로 입력 칸에 복원한다', () => {
  const html = renderToStaticMarkup(
    <AgreementRatesForm
      pgWsId="pg"
      version={2}
      rates={[{ key: 'custom: 앞\n뒤 ', rate: 0.025 }]}
    />,
  );
  expect(html).toContain('name="customLabel"');
  expect(html).toContain('> 앞\n뒤 </textarea>');
  expect(html).toContain('name="customRate"');
  expect(html).toContain('value="2.5"');
});
it('작은 비영 요율을 0으로 반올림해 표시하지 않는다', () => {
  const html = renderToStaticMarkup(
    <AgreementRatesForm
      pgWsId="pg"
      version={2}
      rates={[{ key: 'bank_transfer', rate: 0.00000000001 }]}
    />,
  );
  expect(html).toMatch(/name="rate:bank_transfer" value="(?!0")/);
});
