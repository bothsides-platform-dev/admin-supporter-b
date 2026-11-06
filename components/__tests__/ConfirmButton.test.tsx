// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ActionState } from '@/lib/action-state';
import { ConfirmButton } from '../ConfirmButton';

afterEach(cleanup);

type Action = () => Promise<ActionState | void>;

function setup(action: Action = vi.fn(async (): Promise<ActionState> => ({ status: 'success', message: '처리했습니다.' }))) {
  render(
    <ConfirmButton
      action={action}
      label="정지"
      confirmMessage="정말 정지할까요?"
      confirmLabel="정지 확인"
    />,
  );
  return action;
}

describe('ConfirmButton', () => {
  it('확인 단계로 넘어가면 취소 버튼에 포커스를 둔다', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: '정지' }));

    expect(document.activeElement).toBe(screen.getByRole('button', { name: '취소' }));
  });

  it('Escape 로 취소하면 원래 버튼으로 포커스를 돌려준다', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: '정지' }));
    fireEvent.keyDown(screen.getByRole('button', { name: '취소' }), { key: 'Escape' });

    expect(screen.queryByText('정말 정지할까요?')).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '정지' }));
  });

  it('확인 후 결과 메시지를 보여 주고 원래 버튼으로 포커스를 돌려준다', async () => {
    const action = setup();
    fireEvent.click(screen.getByRole('button', { name: '정지' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '정지 확인' }));
    });

    expect(action).toHaveBeenCalledOnce();
    expect(screen.getByRole('status').textContent).toBe('처리했습니다.');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '정지' }));
  });

  it('사용자가 다른 곳에 포커스를 두고 있으면 빼앗지 않는다', () => {
    render(<input aria-label="메모" />);
    setup();
    const memo = screen.getByRole('textbox', { name: '메모' });
    memo.focus();
    fireEvent.click(screen.getByRole('button', { name: '정지' }));

    expect(document.activeElement).toBe(memo);
  });

  it('처리 중에는 라벨을 숨기되 접근 가능한 이름은 유지한다', async () => {
    let resolve!: () => void;
    setup(vi.fn(() => new Promise<void>((r) => { resolve = r; })));
    fireEvent.click(screen.getByRole('button', { name: '정지' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '정지 확인' }));
    });

    const confirm = screen.getByRole('button', { name: '정지 확인' });
    expect(confirm.getAttribute('aria-busy')).toBe('true');
    expect((confirm as HTMLButtonElement).disabled).toBe(true);

    await act(async () => resolve());
  });
});
