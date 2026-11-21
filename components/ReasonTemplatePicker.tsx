'use client';

import { useRef } from 'react';

/**
 * 자주 쓰는 사유 문구를 같은 폼의 입력란(`name=target`)에 채운다.
 * 입력란이 비어 있으면 그대로 넣고, 이미 쓴 내용이 있으면 뒤에 덧붙인다.
 * 입력란은 서버가 그린 비제어 요소라 값을 직접 바꾼다.
 */
export function ReasonTemplatePicker({ templates, target = 'reason', label = '자주 쓰는 사유' }: {
  templates: readonly string[];
  target?: string;
  label?: string;
}) {
  const ref = useRef<HTMLSelectElement>(null);
  if (templates.length === 0) return null;

  function apply(text: string) {
    const select = ref.current;
    if (!select || !text) return;
    const field = select.closest('form')?.elements.namedItem(target);
    if (field instanceof HTMLTextAreaElement || field instanceof HTMLInputElement) {
      const current = field.value.trim();
      field.value = current ? `${current}${field instanceof HTMLTextAreaElement ? '\n' : ' '}${text}` : text;
      field.dispatchEvent(new Event('input', { bubbles: true }));
      field.focus();
    }
    select.value = '';
  }

  return (
    <select
      ref={ref}
      aria-label={label}
      defaultValue=""
      onChange={(event) => apply(event.target.value)}
      className="max-w-full rounded border border-outline-variant bg-surface px-2 py-1.5 text-label-small text-on-surface-variant"
    >
      <option value="">{label} 선택</option>
      {templates.map((text) => <option key={text} value={text}>{text}</option>)}
    </select>
  );
}
