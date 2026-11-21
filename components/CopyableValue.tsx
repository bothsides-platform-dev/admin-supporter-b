'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * 값과 복사 버튼. `display` 를 주면 화면에는 줄인 표기를 보이고 전체 값을 복사한다.
 * `label` 은 버튼의 접근성 이름("{label} 복사")에 쓴다.
 */
export function CopyableValue({ value, label, display, numeric = false, className }: {
  value: string;
  label: string;
  display?: string;
  numeric?: boolean;
  className?: string;
}) {
  const [status, setStatus] = useState<'idle' | 'copying' | 'copied' | 'error'>('idle');

  async function copy() {
    setStatus('copying');
    try {
      await navigator.clipboard.writeText(value);
      setStatus('copied');
    } catch {
      setStatus('error');
    }
  }

  return (
    <span className={cn('inline-flex flex-wrap items-center gap-2', className)}>
      <span className={cn('break-all', numeric && 'md-numeric', !display && 'select-all')} title={display ? value : undefined}>{display ?? value}</span>
      <button
        type="button"
        onClick={copy}
        disabled={status === 'copying'}
        aria-label={`${label} 복사`}
        className="rounded border border-outline px-2 py-0.5 text-label-small text-primary hover:bg-surface-container-high focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-40"
      >
        복사
      </button>
      <span role="status" className={`text-label-small ${status === 'error' ? 'text-error' : 'text-on-surface-variant'}`}>
        {status === 'copied' && '복사됨'}
        {status === 'error' && '복사하지 못했습니다. 다시 시도해 주세요.'}
      </span>
    </span>
  );
}
