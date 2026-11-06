import { cn } from '@/lib/utils';

/**
 * 버튼 라벨과 진행 스피너를 같은 그리드 칸에 겹쳐 둔다.
 * 처리 중에도 버튼 너비가 라벨 기준으로 유지되어 주변 레이아웃이 밀리지 않는다.
 * 라벨은 `invisible` 이 아니라 `opacity-0` 으로 가린다 — 접근성 트리에 남아
 * 처리 중에도 버튼의 접근 가능한 이름이 사라지지 않게 하기 위해서다.
 */
export function PendingLabel({ pending, children }: { pending: boolean; children: React.ReactNode }) {
  return (
    <span className="inline-grid place-items-center">
      <span className={cn('col-start-1 row-start-1', pending && 'opacity-0')}>{children}</span>
      {pending && (
        <span
          aria-hidden="true"
          className="col-start-1 row-start-1 size-3.5 rounded-full border-2 border-current border-t-transparent animate-spin"
        />
      )}
    </span>
  );
}
