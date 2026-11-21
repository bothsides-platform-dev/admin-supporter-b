// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdminSectionNav } from '../AdminSectionNav';
import { CopyableValue } from '../CopyableValue';
import { ReasonTemplatePicker } from '../ReasonTemplatePicker';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('ReasonTemplatePicker', () => {
  const templates = ['사유 하나', '사유 둘'];

  it('빈 입력란에는 고른 문구를 그대로 채우고 선택을 초기화한다', () => {
    render(<form><ReasonTemplatePicker templates={templates} /><textarea name="reason" aria-label="사유" /></form>);
    const select = screen.getByRole('combobox', { name: '자주 쓰는 사유' }) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: '사유 하나' } });
    expect((screen.getByRole('textbox', { name: '사유' }) as HTMLTextAreaElement).value).toBe('사유 하나');
    expect(select.value).toBe('');
  });

  it('이미 쓴 내용이 있으면 지우지 않고 뒤에 덧붙인다', () => {
    render(<form><ReasonTemplatePicker templates={templates} /><textarea name="reason" aria-label="사유" defaultValue="직접 쓴 내용" /></form>);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '사유 둘' } });
    expect((screen.getByRole('textbox', { name: '사유' }) as HTMLTextAreaElement).value).toBe('직접 쓴 내용\n사유 둘');
  });

  it('한 줄 입력란에는 공백으로 이어 붙인다', () => {
    render(<form><ReasonTemplatePicker templates={templates} /><input name="reason" aria-label="사유" defaultValue="먼저" /></form>);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '사유 하나' } });
    expect((screen.getByRole('textbox', { name: '사유' }) as HTMLInputElement).value).toBe('먼저 사유 하나');
  });

  it('문구가 없으면 아무것도 그리지 않는다', () => {
    const { container } = render(<form><ReasonTemplatePicker templates={[]} /></form>);
    expect(container.querySelector('select')).toBeNull();
  });
});

describe('CopyableValue', () => {
  it('줄인 표기를 보여 주더라도 전체 값을 복사한다', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    render(<CopyableValue value="20000000-0000-4000-8000-000000000001" display="20000000…" label="대상 ID" />);
    expect(screen.getByText('20000000…')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: '대상 ID 복사' }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('복사됨'));
    expect(writeText).toHaveBeenCalledWith('20000000-0000-4000-8000-000000000001');
  });
});

describe('AdminSectionNav', () => {
  it('섹션마다 같은 페이지 앵커를 만든다', () => {
    render(<AdminSectionNav items={[{ id: 'members', label: '멤버' }, { id: 'history', label: '변경 이력' }]} />);
    expect(screen.getByRole('link', { name: '멤버' }).getAttribute('href')).toBe('#members');
    expect(screen.getByRole('navigation', { name: '이 페이지의 섹션' })).toBeDefined();
  });

  it('섹션이 하나뿐이면 목차를 그리지 않는다', () => {
    const { container } = render(<AdminSectionNav items={[{ id: 'only', label: '하나' }]} />);
    expect(container.firstChild).toBeNull();
  });
});
