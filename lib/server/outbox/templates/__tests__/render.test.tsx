import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Layout } from '../_layout';

it('관리자 이메일의 공통 푸터를 자연스러운 한국어로 보여준다', () => {
  const html = renderToStaticMarkup(<Layout>승인 결과</Layout>);
  expect(html).toContain('서포트비에서 보낸 발신 전용 메일입니다.');
  expect(html).not.toContain('·');
});
