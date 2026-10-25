import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { GuestJourneyDetail } from '../GuestJourneyDetail';

const at = new Date('2026-10-25T00:01:00Z');
const event = { id: 'e1', name: 'funnel_step_complete', funnel_id: 'questions', step_id: 'website', answer: '<script>alert(1)</script>', observedAt: at, createdAt: at };
const detail = { journey: { draftId: '10000000-0000-4000-8000-000000000001', userId: null, workspaceId: null, userName: null, email: null, workspaceName: null, createdAt: at, retiredAt: null, deletedAt: null, status: 'in_progress', analytics: [{ observedAt: at.toISOString(), ga: { clientId: '123.456', sessionId: '789' }, clarity: { userId: 'abc', sessionId: 'def' } }] }, events: [event], answers: [event], total: 1, page: 1, errorCount: 0, lastEvent: event };

it('renders Korean actions, full escaped answers, identity and validated recording links', () => {
  const html = renderToStaticMarkup(<GuestJourneyDetail detail={detail} />);
  expect(html).toContain('홈페이지');
  expect(html).toContain('입력 완료');
  expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  expect(html).not.toContain('<script>');
  expect(html).toContain('123.456');
  expect(html).toContain('https://clarity.microsoft.com/player/xiq81e87yn/abc/def');
  expect(html).toContain('09:01');
});

it('distinguishes server completion and empty retained history without inferring abandonment', () => {
  const html = renderToStaticMarkup(<GuestJourneyDetail detail={{ ...detail, journey: { ...detail.journey, status: 'submitted', retiredAt: at, analytics: [] }, events: [], answers: [], lastEvent: null, total: 0 }} />);
  expect(html).toContain('요청 완료');
  expect(html).toContain('보관 중인 행동 기록이 없어요');
  expect(html).not.toContain('이탈');
});
