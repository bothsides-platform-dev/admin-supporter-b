'use client';

import { useState, useTransition } from 'react';
import { IDLE_ACTION_STATE, type ActionState } from '@/lib/action-state';
import { ActionMessage } from './ActionForm';

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

  function handleConfirm() {
    startTransition(async () => {
      const next = await action();
      setResult(next ?? IDLE_ACTION_STATE);
      setStage('idle');
    });
  }

  if (stage === 'idle') {
    return (
      <div className="inline-flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setResult(IDLE_ACTION_STATE);
            setStage('confirming');
          }}
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
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-body-small text-on-surface-variant">{confirmMessage}</span>
      <button
        type="button"
        onClick={handleConfirm}
        disabled={isPending}
        className={confirmClassName}
      >
        {isPending && (
          <span className="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin mr-1 align-middle" />
        )}
        {confirmLabel}
      </button>
      <button
        type="button"
        onClick={() => setStage('idle')}
        disabled={isPending}
        className="text-label-small text-on-surface-variant hover:text-on-surface"
      >
        취소
      </button>
    </div>
  );
}
