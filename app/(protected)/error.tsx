'use client';

/**
 * 보호 영역 공통 에러 경계. 서버 액션/렌더링에서 예상치 못한 예외가 나면
 * Next 기본 에러 화면 대신 AdminShell 안에서 이 화면을 보여준다.
 * 예상 가능한 실패는 액션이 ActionState로 반환하므로 여기까지 오지 않아야 한다.
 */
export default function ProtectedError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <div role="alert" className="max-w-xl space-y-3 rounded border border-error p-6">
      <h1 className="text-title-small font-semibold text-error">처리 중 오류가 발생했습니다</h1>
      <p className="text-body-small text-on-surface-variant">
        잠시 후 다시 시도해 주세요. 문제가 계속되면 아래 오류 코드를 개발팀에 전달해 주세요.
      </p>
      {error.digest && (
        <p className="text-label-small text-on-surface-variant md-numeric">오류 코드: {error.digest}</p>
      )}
      <button
        type="button"
        onClick={() => unstable_retry()}
        className="rounded border border-outline px-4 py-2 text-label-small text-on-surface hover:bg-surface-container-low"
      >
        다시 시도
      </button>
    </div>
  );
}
