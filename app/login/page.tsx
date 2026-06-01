import { googleSignInAction } from './actions';

const ERROR_MESSAGES: Record<string, string> = {
  AccessDenied: '허용되지 않은 Google 계정입니다.',
  OAuthSignin: 'Google 로그인 중 오류가 발생했습니다.',
  OAuthCallback: 'Google 로그인 중 오류가 발생했습니다.',
  OAuthCreateAccount: 'Google 계정 연결 중 오류가 발생했습니다.',
  Callback: '로그인 처리 중 오류가 발생했습니다.',
  Default: '로그인 중 오류가 발생했습니다.',
};

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const errorMessage = error ? (ERROR_MESSAGES[error] ?? ERROR_MESSAGES.Default) : null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-80 space-y-4 rounded border border-outline-variant bg-surface p-6">
        <h1 className="text-title-large font-semibold">Admin 로그인</h1>
        {errorMessage && (
          <p className="text-body-small text-error">{errorMessage}</p>
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
