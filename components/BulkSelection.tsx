'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

/** 같은 폼 안에서 이름이 `name` 이고 고를 수 있는 체크박스. */
function selectable(form: HTMLFormElement | null, name: string): HTMLInputElement[] {
  if (!form) return [];
  return Array.from(form.querySelectorAll<HTMLInputElement>(`input[type="checkbox"][name="${name}"]`)).filter((box) => !box.disabled);
}

/**
 * 폼의 change 와 reset 에 맞춰 `sync` 를 부른다. reset 이벤트는 값이 초기화되기
 * 전에 오므로 한 틱 미룬다. 행이 서버에서 바뀌는 경우(페이지 이동·일괄 처리 뒤)는
 * 이벤트가 없으니 호출부가 `resetKey` 를 바꿔 effect 를 다시 돌린다.
 */
function listen(form: HTMLFormElement, sync: (event?: Event) => void): () => void {
  const onReset = () => setTimeout(() => sync(), 0);
  form.addEventListener('change', sync);
  form.addEventListener('reset', onReset);
  return () => {
    form.removeEventListener('change', sync);
    form.removeEventListener('reset', onReset);
  };
}

/**
 * 표 머리글의 "현재 페이지 전체 선택". 행 체크박스는 서버가 그린 일반 input 이라
 * 상태를 따로 들지 않고 폼의 change 이벤트로 맞춘다.
 */
export function BulkSelectAll({ name, label, resetKey }: { name: string; label: string; resetKey?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const [available, setAvailable] = useState(true);

  useEffect(() => {
    const box = ref.current;
    const form = box?.closest('form') ?? null;
    if (!box || !form) return;
    const sync = (event?: Event) => {
      // 전체 선택 상자 자신의 change 는 toggle 이 처리한다. 여기서 값을 되돌리면 안 된다.
      if (event?.target === box) return;
      const boxes = selectable(form, name);
      const checked = boxes.filter((item) => item.checked).length;
      box.checked = boxes.length > 0 && checked === boxes.length;
      box.indeterminate = checked > 0 && checked < boxes.length;
      setAvailable(boxes.length > 0);
    };
    sync();
    return listen(form, sync);
  }, [name, resetKey]);

  function toggle(checked: boolean) {
    const form = ref.current?.closest('form') ?? null;
    for (const box of selectable(form, name)) box.checked = checked;
    // 건수 표시(BulkSelectionBar)가 같은 change 이벤트를 듣는다.
    form?.dispatchEvent(new Event('change', { bubbles: true }));
  }

  return <input ref={ref} type="checkbox" aria-label={label} disabled={!available} onChange={(event) => toggle(event.target.checked)} />;
}

/**
 * 선택한 건이 있을 때만 일괄 처리 입력(children)을 보여 주고 건수를 알린다.
 * 선택이 없으면 안내 문구만 남긴다.
 */
export function BulkSelectionBar({ name, hint, resetKey, children }: { name: string; hint: string; resetKey?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [count, setCount] = useState(0);

  useEffect(() => {
    const form = ref.current?.closest('form') ?? null;
    if (!form) return;
    const sync = () => setCount(selectable(form, name).filter((box) => box.checked).length);
    sync();
    return listen(form, sync);
  }, [name, resetKey]);

  return (
    <div ref={ref} className="mt-3 flex flex-wrap items-center gap-2 rounded border border-outline-variant bg-surface p-3">
      <span role="status" className="md-numeric text-label-small font-medium">{count > 0 ? `${count}건 선택` : hint}</span>
      {count > 0 && children}
    </div>
  );
}
