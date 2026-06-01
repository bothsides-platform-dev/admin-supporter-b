import { googleSignInAction } from './actions';

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const isUnauthorized = error === 'AccessDenied';

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-80 space-y-4 rounded border border-outline-variant bg-surface p-6">
        <h1 className="text-title-large font-semibold">Admin 로그인</h1>
        {isUnauthorized && (
          <p className="text-body-small text-error">허용되지 않은 Google 계정입니다.</p>
        )}
        <form action={googleSignInAction}>
          <button
            type="submit"
            className="w-full rounded bg-primary px-4 py-2 text-label-large text-on-primary"
          >
            Google로 로그인
          </button>
        </form>
      </div>
    </div>
  );
}
