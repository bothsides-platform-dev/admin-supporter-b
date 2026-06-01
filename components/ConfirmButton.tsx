'use client';

import { useState, useTransition } from 'react';

type ConfirmButtonProps = {
  action: () => Promise<void>;
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
  const [isPending, startTransition] = useTransition();

  function handleConfirm() {
    startTransition(async () => {
      await action();
      setStage('idle');
    });
  }

  if (stage === 'idle') {
    return (
      <button
        type="button"
        onClick={() => setStage('confirming')}
        disabled={disabled}
        className={labelClassName}
      >
        {label}
      </button>
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
