// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { formatKST } from '@/lib/utils';
import { RfpPgResponseTable } from '../RfpPgResponseTable';

afterEach(cleanup);

describe('RfpPgResponseTable', () => {
  it('열람만 한 곳과 제출·철회한 곳을 구분하고, PG별로 발송·열람 시각을 표시한다', () => {
    const sentAt = new Date('2026-09-13T23:55:00Z');
    const openedAt = new Date('2026-09-14T00:15:00Z');
    render(<RfpPgResponseTable rows={[
      { pgWsId: 'pg-1', pgWsName: '가페이', sentAt, openedAt: null, latestBid: null },
      { pgWsId: 'pg-2', pgWsName: '나페이', sentAt, openedAt, latestBid: null },
      { pgWsId: 'pg-3', pgWsName: '다페이', sentAt, openedAt: null, latestBid: { round: 2, status: 'submitted' } },
      { pgWsId: 'pg-4', pgWsName: '라페이', sentAt, openedAt, latestBid: { round: 1, status: 'withdrawn' } },
    ]} />);

    const table = within(screen.getByRole('table', { name: '초대한 PG사별 응답 현황' }));
    expect(screen.getByRole('link', { name: '전체 RFP의 PG사별 현황' }).getAttribute('href')).toBe('/pg-status');
    expect(table.getByRole('row', { name: /가페이 열람 기록 없음/ })).toBeDefined();
    expect(table.getByRole('row', { name: /다페이 2차 견적 제출/ })).toBeDefined();
    expect(table.getByRole('row', { name: /라페이 1차 견적 철회/ })).toBeDefined();
    const openedRow = within(table.getByRole('row', { name: /나페이 열람 후 미제출/ }));
    expect(openedRow.getByRole('link', { name: '나페이' }).id).toBe('pg-response-pg-2');
    expect(openedRow.getByText(formatKST(sentAt)).getAttribute('datetime')).toBe(sentAt.toISOString());
    expect(openedRow.getByText(formatKST(openedAt)).getAttribute('datetime')).toBe(openedAt.toISOString());
    expect(openedRow.getByRole('link', { name: '나페이' }).getAttribute('href')).toBe('/sellers/pg-2');
    expect(screen.getByText('초대 4곳 · 견적 제출 이력 2곳 (철회 포함)')).toBeDefined();
    expect(table.queryByRole('button')).toBeNull();
  });

  it('초대를 보내지 않은 RFP는 미응답이 아니라 빈 상태로 표시한다', () => {
    render(<RfpPgResponseTable rows={[]} />);
    expect(screen.getByRole('cell', { name: '발송된 PG사 초대가 없습니다.' })).toBeDefined();
    expect(screen.queryByText(/견적 제출 이력/)).toBeNull();
  });
});
