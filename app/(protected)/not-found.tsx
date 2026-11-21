import Link from 'next/link';

/** 상세 화면이 `notFound()` 를 던졌을 때 AdminShell 안에서 보여 주는 화면. */
export default function ProtectedNotFound() {
  return (
    <div className="max-w-xl space-y-3 rounded border border-outline-variant p-6">
      <h1 className="text-title-medium font-semibold">찾을 수 없는 항목입니다</h1>
      <p className="text-body-small text-on-surface-variant">
        삭제되었거나 주소가 잘못되었을 수 있습니다. 왼쪽 메뉴에서 목록을 다시 열어 확인해 주세요.
      </p>
      <Link href="/" data-pressable className="inline-block rounded border border-outline px-4 py-2 text-label-small hover:bg-surface-container-low">
        대시보드로 이동
      </Link>
    </div>
  );
}
