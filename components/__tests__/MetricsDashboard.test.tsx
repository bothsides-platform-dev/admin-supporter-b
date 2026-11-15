import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { computeOverview, type MetricsInput } from '@/lib/metrics/compute';
import { MetricsDashboard } from '../MetricsDashboard';

const at = (iso: string) => new Date(iso);
const NOW = at('2026-11-15T03:00:00Z'); // 일요일 12:00 KST

const EMPTY: MetricsInput = {
  workspaces: [], members: [], approvals: [], requests: [], invitations: [], bids: [], awards: [], activity: [],
};

function input(): MetricsInput {
  return {
    ...EMPTY,
    workspaces: [
      { id: 'B1', type: 'buyer', name: '알파상사', createdAt: at('2026-11-03T01:00:00Z'), canonicalPgKey: null },
      { id: 'P1', type: 'pg', name: 'PG <원>', createdAt: at('2026-09-01T00:00:00Z'), canonicalPgKey: null },
      { id: 'P2', type: 'pg', name: '등록만 PG', createdAt: at('2026-01-01T00:00:00Z'), canonicalPgKey: 'pg-two' },
    ],
    members: [
      {
        workspaceId: 'B1', userId: 'u1', joinedAt: at('2026-11-03T01:00:00Z'), approvalStatus: 'approved',
        email: 'u1@customer.example', emailVerified: true, emailVerifiedAt: at('2026-11-03T02:00:00Z'),
        isSystemAccount: false, signupSource: { utmSource: 'google', utmMedium: 'cpc' },
      },
      {
        workspaceId: 'P1', userId: 'p1', joinedAt: at('2026-09-01T00:00:00Z'), approvalStatus: 'approved',
        email: 'p1@pg.example', emailVerified: true, emailVerifiedAt: at('2026-09-01T00:00:00Z'),
        isSystemAccount: false, signupSource: {},
      },
    ],
    approvals: [{ workspaceId: 'B1', reviewedAt: at('2026-11-03T03:00:00Z') }],
    requests: [
      { id: 'R1', buyerWsId: 'B1', status: 'awarded', deadline: at('2026-11-10T09:00:00Z'), sentAt: at('2026-11-04T01:00:00Z') },
      { id: 'R2', buyerWsId: 'B1', status: 'sent', deadline: at('2026-11-12T09:00:00Z'), sentAt: at('2026-11-05T01:00:00Z') },
    ],
    invitations: [
      { rfpId: 'R1', pgWsId: 'P1', sentAt: at('2026-11-04T01:00:00Z'), openedAt: at('2026-11-04T02:00:00Z') },
      { rfpId: 'R2', pgWsId: 'P1', sentAt: at('2026-11-05T01:00:00Z'), openedAt: null },
    ],
    bids: [{ rfpId: 'R1', pgWsId: 'P1', submittedAt: at('2026-11-05T01:00:00Z') }],
    awards: [{ rfpId: 'R1', pgWsId: 'P1', awardedAt: at('2026-11-06T01:00:00Z') }],
    activity: [{ userId: 'p1', workspaceId: 'P1', day: '2026-11-05' }],
  };
}

const render = (data: MetricsInput, weeks = 4) =>
  renderToStaticMarkup(<MetricsDashboard overview={computeOverview(data, { now: NOW, weeks })} />);

describe('MetricsDashboard', () => {
  it('지난주 요약은 끝난 주를 쓰고 진행 중인 주는 표에서 따로 표시한다', () => {
    const html = render(input());

    expect(html).toContain('지난주 요약 (11/2~11/8)');
    expect(html).toContain('11/9~11/15');
    expect(html).toContain('진행 중');
  });

  it('표본이 작으면 퍼센트 없이 분자/분모만 보여준다', () => {
    const html = render(input());

    // 종결 2건 중 견적 수신 1건
    expect(html).toContain('1/2');
    expect(html).not.toMatch(/\d+%\)/);
    expect(html).toContain('종결 2건, 진행 중 0건');
  });

  it('행동 기준이라는 한계와 제외 기준을 화면에 적는다', () => {
    const html = render(input());

    expect(html).toContain('조회만 한 방문은 기록이 없어 포함하지 않으므로');
    expect(html).toContain('담당자가 아직 합류하지 않았고 이 기간에 요청도 받지 않은 PG사 1곳은 표에 넣지 않았어요.');
    expect(html).toContain('담당자가 합류하지 않은 PG사 1곳은 신규·활성 수에 넣지 않아요.');
    expect(html).toContain('내부 계정 도메인: 설정되지 않음');
    expect(html).toContain('2026. 11. 15.');
  });

  it('담당자가 없는 PG사가 요청을 받으면 표에 미합류로 표시한다', () => {
    const data = input();
    data.requests.push({ id: 'R3', buyerWsId: 'B1', status: 'sent', deadline: at('2026-11-12T09:00:00Z'), sentAt: at('2026-11-06T01:00:00Z') });
    data.invitations.push({ rfpId: 'R3', pgWsId: 'P2', sentAt: at('2026-11-06T01:00:00Z'), openedAt: null });
    const html = render(data);

    expect(html).toContain('href="/sellers/P2"');
    expect(html).toContain('담당자 미합류');
    expect(html).not.toContain('이 기간에 요청도 받지 않은 PG사');
  });

  it('PG사 이름은 이스케이프하고 판매사 상세로 연결한다', () => {
    const html = render(input());

    expect(html).toContain('href="/sellers/P1"');
    expect(html).toContain('PG &lt;원&gt;');
    expect(html).not.toContain('PG <원>');
  });

  it('표는 행 제목과 이름 붙은 스크롤 영역을 가진다', () => {
    const html = render(input());

    expect(html).toContain('role="region"');
    expect(html).toContain('aria-labelledby="metrics-weekly-caption"');
    expect(html).toContain('<caption id="metrics-weekly-caption"');
    expect(html).toContain('scope="row"');
    expect(html).toContain('scope="col"');
  });

  it('선택한 기간을 기간 선택에 반영한다', () => {
    const html = render(input(), 26);

    expect(html).toMatch(/<option value="26" selected="">최근 26주<\/option>/);
    expect(html).toContain('최근 26주에 만들어진 구매사 워크스페이스');
  });

  it('데이터가 없어도 줄표와 빈 상태 문구로 렌더링한다', () => {
    const html = render(EMPTY);

    expect(html).toContain('—');
    expect(html).toContain('집계할 PG사가 없어요.');
    expect(html).toContain('이 기간에 만들어진 구매사 워크스페이스가 없어요.');
    expect(html).not.toContain('NaN');
  });
});
