// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { BulkSelectAll, BulkSelectionBar } from '../BulkSelection';

afterEach(cleanup);

function renderForm() {
  return render(
    <form>
      <BulkSelectAll name="applicationIds" label="전체 선택" />
      <input type="checkbox" name="applicationIds" value="a" aria-label="가" />
      <input type="checkbox" name="applicationIds" value="b" aria-label="나" />
      <input type="checkbox" name="applicationIds" value="c" aria-label="처리 완료" disabled />
      <BulkSelectionBar name="applicationIds" hint="신청을 선택하세요.">
        <input name="reason" aria-label="사유" />
      </BulkSelectionBar>
    </form>,
  );
}

const box = (name: string) => screen.getByRole('checkbox', { name }) as HTMLInputElement;

describe('BulkSelection', () => {
  it('선택이 없으면 안내만 보이고 일괄 처리 입력은 숨긴다', () => {
    renderForm();
    expect(screen.getByRole('status').textContent).toBe('신청을 선택하세요.');
    expect(screen.queryByRole('textbox', { name: '사유' })).toBeNull();
  });

  it('행을 고르면 건수와 입력이 나타나고 전체 선택은 일부 선택 상태가 된다', () => {
    renderForm();
    fireEvent.click(box('가'));
    expect(screen.getByRole('status').textContent).toBe('1건 선택');
    expect(screen.getByRole('textbox', { name: '사유' })).toBeDefined();
    expect(box('전체 선택').indeterminate).toBe(true);
    expect(box('전체 선택').checked).toBe(false);
  });

  it('전체 선택은 고를 수 있는 행만 모두 고르고, 다시 누르면 모두 푼다', () => {
    renderForm();
    fireEvent.click(box('전체 선택'));
    expect(box('가').checked).toBe(true);
    expect(box('나').checked).toBe(true);
    expect(box('처리 완료').checked).toBe(false);
    expect(box('전체 선택').checked).toBe(true);
    expect(screen.getByRole('status').textContent).toBe('2건 선택');

    fireEvent.click(box('전체 선택'));
    expect(box('가').checked).toBe(false);
    expect(screen.getByRole('status').textContent).toBe('신청을 선택하세요.');
  });

  it('고를 수 있는 행이 없으면 전체 선택을 비활성화한다', () => {
    render(<form><BulkSelectAll name="applicationIds" label="전체 선택" /><input type="checkbox" name="applicationIds" disabled aria-label="완료" /></form>);
    expect(box('전체 선택').disabled).toBe(true);
  });

  it('행이 서버에서 바뀌면(resetKey 변경) 낡은 선택 건수를 버리고 다시 센다', () => {
    const view = (rows: string[], resetKey: string) => (
      <form>
        <BulkSelectAll name="applicationIds" label="전체 선택" resetKey={resetKey} />
        {rows.map((row) => <input key={row} type="checkbox" name="applicationIds" value={row} aria-label={row} />)}
        <BulkSelectionBar name="applicationIds" hint="신청을 선택하세요." resetKey={resetKey}><input name="reason" aria-label="사유" /></BulkSelectionBar>
      </form>
    );
    const { rerender } = render(view(['가', '나'], 'page-1'));
    fireEvent.click(box('전체 선택'));
    expect(screen.getByRole('status').textContent).toBe('2건 선택');

    rerender(view(['다', '라'], 'page-2'));
    expect(screen.getByRole('status').textContent).toBe('신청을 선택하세요.');
    expect(box('전체 선택').checked).toBe(false);
    expect(screen.queryByRole('textbox', { name: '사유' })).toBeNull();
  });
});
