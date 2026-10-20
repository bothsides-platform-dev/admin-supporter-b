'use client';

import { useState } from 'react';

export function BusinessNumber({ value }: { value: string }) {
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
    <span className="ml-3 inline-flex flex-wrap items-center gap-2">
      <span className="md-numeric select-all">{value}</span>
      <button
        type="button"
        onClick={copy}
        disabled={status === 'copying'}
        aria-label="사업자번호 복사"
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
