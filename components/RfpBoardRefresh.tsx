'use client';

import { useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';

export function RfpBoardRefresh({ checkedAt }: { checkedAt: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const refreshVisible = () => {
      if (document.visibilityState === 'visible') startTransition(() => router.refresh());
    };
    const timer = window.setInterval(refreshVisible, 60_000);
    document.addEventListener('visibilitychange', refreshVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refreshVisible);
    };
  }, [router]);

  return (
    <div className="flex flex-wrap items-center gap-2 text-label-small">
      <span className="text-on-surface-variant">최근 조회 {checkedAt}</span>
      <button
        type="button"
        className="rounded border border-outline-variant px-2 py-1"
        disabled={pending}
        onClick={() => startTransition(() => router.refresh())}
      >
        {pending ? '조회 중' : '새로고침'}
      </button>
    </div>
  );
}
