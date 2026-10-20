// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BusinessNumber } from '../BusinessNumber';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function mockClipboard(writeText: ReturnType<typeof vi.fn>) {
  vi.stubGlobal('navigator', { clipboard: { writeText } });
}

describe('BusinessNumber', () => {
  it('표시된 사업자번호를 그대로 복사하고 완료를 알린다', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    mockClipboard(writeText);
    render(<BusinessNumber value="123-45-67890" />);
    fireEvent.click(screen.getByRole('button', { name: '사업자번호 복사' }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('복사됨'));
    expect(writeText).toHaveBeenCalledWith('123-45-67890');
    expect(screen.getByText('123-45-67890')).toBeDefined();
  });

  it('복사 실패를 알리고 같은 버튼으로 재시도할 수 있다', async () => {
    const writeText = vi.fn().mockRejectedValueOnce(new Error('denied')).mockResolvedValueOnce(undefined);
    mockClipboard(writeText);
    render(<BusinessNumber value="1234567890" />);
    const button = screen.getByRole('button', { name: '사업자번호 복사' });
    fireEvent.click(button);
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('복사하지 못했습니다.'));
    fireEvent.click(button);
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('복사됨'));
    expect(writeText).toHaveBeenCalledTimes(2);
  });
});
