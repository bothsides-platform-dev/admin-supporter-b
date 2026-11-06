'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { IDLE_ACTION_STATE, type ActionState } from '@/lib/action-state';
import { ActionMessage } from './ActionForm';
import { PendingLabel } from './PendingLabel';

type ConfirmButtonProps = {
  /** ActionState를 반환하면 결과 메시지를 버튼 옆에 표시한다. redirect 하는 액션은 void. */
  action: () => Promise<ActionState | void>;
  label: string;
  confirmMessage: string;
  confirmLabel: string;
  labelClassName?: string;
  confirmClassName?: string;
  disabled?: boolean;
};

export function ConfirmButton({
  action,
  label,
  confirmMessage,
  confirmLabel,
  labelClassName,
  confirmClassName,
  disabled,
}: ConfirmButtonProps) {
  const [stage, setStage] = useState<'idle' | 'confirming'>('idle');
  const [result, setResult] = useState<ActionState>(IDLE_ACTION_STATE);
  const [isPending, startTransition] = useTransition();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  // 단계 전환 때 눌렀던 버튼이 언마운트되면 포커스가 <body>로 떨어진다.
  // 전환을 일으킨 쪽에서 다음 포커스 대상을 정해 두고, 커밋 후 옮긴다.
  const nextFocus = useRef<'trigger' | 'cancel' | null>(null);

  useEffect(() => {
    const target = nextFocus.current;
    nextFocus.current = null;
    if (!target) return;
    // 그사이 사용자가 다른 곳에 포커스를 뒀다면 빼앗지 않는다.
    const active = document.activeElement;
    if (active && active !== document.body) return;
    (target === 'cancel' ? cancelRef : triggerRef).current?.focus();
  }, [stage]);

  function openConfirm() {
    setResult(IDLE_ACTION_STATE);
    // 파괴적 확인 단계의 기본 포커스는 되돌릴 수 있는 쪽(취소)에 둔다.
    nextFocus.current = 'cancel';
    setStage('confirming');
  }

  function cancel() {
    if (isPending) return;
    nextFocus.current = 'trigger';
    setStage('idle');
  }

  function handleConfirm() {
    startTransition(async () => {
      const next = await action();
      setResult(next ?? IDLE_ACTION_STATE);
      nextFocus.current = 'trigger';
      setStage('idle');
    });
  }

  if (stage === 'idle') {
    return (
      <div className="inline-flex flex-wrap items-center gap-2">
        <button
          ref={triggerRef}
          type="button"
          onClick={openConfirm}
          disabled={disabled}
          className={labelClassName}
        >
          {label}
        </button>
        <ActionMessage state={result} />
      </div>
    );
  }

  return (
    <div
      className="flex items-center gap-2 flex-wrap"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          cancel();
        }
      }}
    >
      <span className="text-body-small text-on-surface-variant">{confirmMessage}</span>
      <button
        type="button"
        onClick={handleConfirm}
        disabled={isPending}
        aria-busy={isPending}
        className={confirmClassName}
      >
        <PendingLabel pending={isPending}>{confirmLabel}</PendingLabel>
      </button>
      <button
        ref={cancelRef}
        type="button"
        onClick={cancel}
        disabled={isPending}
        className="text-label-small text-on-surface-variant hover:text-on-surface"
      >
        취소
      </button>
    </div>
  );
}
