/**
 * 보호 영역 공통 로딩 화면. 레이아웃(AdminShell) 안에서 본문 자리만 채우므로
 * 메뉴는 그대로 남고 조작할 수 있다.
 */
export default function ProtectedLoading() {
  return (
    <div role="status" aria-live="polite" className="space-y-4">
      <span className="sr-only">불러오는 중</span>
      <div aria-hidden="true" className="space-y-4 motion-safe:animate-pulse">
        <div className="h-8 w-48 rounded bg-surface-container-highest" />
        <div className="flex flex-wrap gap-2">
          <div className="h-9 w-64 rounded bg-surface-container-highest" />
          <div className="h-9 w-28 rounded bg-surface-container-highest" />
          <div className="h-9 w-28 rounded bg-surface-container-highest" />
        </div>
        <div className="overflow-hidden rounded border border-outline-variant">
          <div className="h-9 border-b border-outline-variant bg-surface-container-low" />
          {Array.from({ length: 8 }, (_, index) => (
            <div key={index} className="flex items-center gap-4 border-b border-outline-variant px-4 py-3 last:border-0">
              <div className="h-4 w-1/3 rounded bg-surface-container-highest" />
              <div className="h-4 w-16 rounded bg-surface-container-highest" />
              <div className="ml-auto h-4 w-24 rounded bg-surface-container-highest" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
