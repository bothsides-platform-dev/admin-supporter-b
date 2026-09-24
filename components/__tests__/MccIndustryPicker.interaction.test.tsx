// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { MccIndustryPicker } from '../MccIndustryPicker';

afterEach(cleanup);

it('검색 중 업종을 선택하고 검색을 바꿔도 선택을 유지해 해당 코드만 제출한다', async () => {
  const action = vi.fn<(formData: FormData) => Promise<void>>(async () => {});
  const { container } = render(<MccIndustryPicker action={action} registered={[]} />);
  const search = screen.getByRole('searchbox');
  fireEvent.change(search, { target: { value: '의류' } });
  const list = within(container.querySelector('fieldset')!);
  const clothing = list.getByRole('checkbox', { name: /종합 의류 판매/ });
  fireEvent.click(clothing);
  expect((clothing as HTMLInputElement).checked).toBe(true);

  fireEvent.change(search, { target: { value: '교육' } });
  fireEvent.change(search, { target: { value: '의류' } });
  expect((list.getByRole('checkbox', { name: /종합 의류 판매/ }) as HTMLInputElement).checked).toBe(true);

  fireEvent.click(screen.getByRole('button', { name: '선택한 업종 등록' }));
  await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
  const formData = action.mock.calls[0][0] as FormData;
  expect(formData.getAll('mccCodes')).toEqual(['5651']);
});

it('검색 결과 전체 선택은 보이는 업종을 더하고 선택 해제는 모두 비운다', () => {
  const { container } = render(<MccIndustryPicker action={async () => {}} registered={[]} />);
  fireEvent.change(within(container).getByRole('searchbox'), { target: { value: '교육' } });
  fireEvent.click(screen.getByRole('button', { name: '검색 결과 모두 선택' }));
  const list = within(container.querySelector('fieldset')!);
  expect(list.getAllByRole('checkbox').every(box => (box as HTMLInputElement).checked)).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: '선택 해제' }));
  expect(list.getAllByRole('checkbox').every(box => !(box as HTMLInputElement).checked)).toBe(true);
});
