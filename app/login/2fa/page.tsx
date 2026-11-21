import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import QRCode from 'qrcode';

import { logoutAction } from '@/app/login/actions';
import { SubmitButton } from '@/components/SubmitButton';
import { hasPassedMfa, requireAdminIdentity } from '@/lib/auth/admin-session';
import { ensurePendingTotpSecret, readMfaLock } from '@/lib/auth/admin-users';
import { safeLoginDestination } from '@/lib/auth/login-destination';
import { MFA_COOKIE_NAME } from '@/lib/auth/mfa-cookie';
import { preparePasskeySignIn, relyingParty } from '@/lib/auth/passkeys';
import { formatSecretForDisplay, otpauthUri } from '@/lib/auth/totp';
import { actionDb } from '@/lib/server/actions/auth/_shared';
import { formatKST } from '@/lib/utils';
import { submitTotpAction } from './actions';
import { PasskeySignIn } from './PasskeySignIn';

const ERROR_MESSAGES: Record<string, string> = {
  INVALID_CODE: '인증 코드가 맞지 않습니다. 앱에 지금 표시된 6자리 코드를 입력해 주세요.',
  LOCKED: '인증 코드를 여러 번 잘못 입력해 잠시 잠겼습니다.',
  NOT_READY: '인증 설정이 바뀌었습니다. 화면 안내에 따라 다시 진행해 주세요.',
};

export default async function TwoFactorPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; callbackUrl?: string | string[] }>;
}) {
  const { error, callbackUrl } = await searchParams;
  const destination = safeLoginDestination(callbackUrl);
  // /login/* is outside the proxy matcher, so this page checks the first factor itself.
  const identity = await requireAdminIdentity();
  const now = new Date();
  if (hasPassedMfa(identity, (await cookies()).get(MFA_COOKIE_NAME)?.value, now)) redirect(destination);

  const db = actionDb();
  const lockedUntil = await readMfaLock(db, identity.email, now);
  const enrolling = !identity.totpEnabledAt;
  const secret = enrolling ? await ensurePendingTotpSecret(db, identity.adminUserId, now) : null;
  // Offered only to an enrolled admin who registered a passkey; it stays available while the code path is locked.
  const relying = enrolling ? null : relyingParty((await headers()).get('host'));
  const passkey = relying ? await preparePasskeySignIn(db, identity, relying, now) : null;
  const qrSrc = secret
    ? `data:image/svg+xml;utf8,${encodeURIComponent(
        await QRCode.toString(otpauthUri(identity.email, secret), {
          type: 'svg',
          margin: 1,
          errorCorrectionLevel: 'M',
          color: { dark: '#000000', light: '#ffffff' },
        }),
      )}`
    : null;
  const errorMessage = lockedUntil
    ? `인증 코드를 여러 번 잘못 입력해 잠겼습니다. ${formatKST(lockedUntil)} 이후 다시 시도해 주세요.`
    : error && error !== 'LOCKED'
      ? (ERROR_MESSAGES[error] ?? ERROR_MESSAGES.INVALID_CODE)
      : null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-4 rounded border border-outline-variant bg-surface p-6">
        <div className="space-y-1">
          <h1 className="text-title-large font-semibold">{enrolling ? '2단계 인증 등록' : '2단계 인증'}</h1>
          <p className="text-body-small text-on-surface-variant break-all">{identity.email}</p>
        </div>

        {enrolling ? (
          <ol className="list-decimal space-y-1 pl-5 text-body-small text-on-surface-variant">
            <li>Google Authenticator, 1Password 같은 인증 앱을 엽니다.</li>
            <li>아래 QR 코드를 스캔하거나 설정 키를 직접 입력합니다.</li>
            <li>앱에 표시된 6자리 코드를 입력해 등록을 마칩니다.</li>
          </ol>
        ) : passkey ? (
          <p className="text-body-small text-on-surface-variant">패스키로 인증하거나 인증 앱의 6자리 코드를 입력해 주세요.</p>
        ) : (
          <p className="text-body-small text-on-surface-variant">인증 앱에 표시된 6자리 코드를 입력해 주세요.</p>
        )}

        {passkey && (
          <PasskeySignIn
            options={passkey.options}
            token={passkey.token}
            expiresAt={passkey.expiresAt}
            callbackUrl={destination}
          />
        )}

        {qrSrc && secret && (
          <div className="space-y-2">
            {/* eslint-disable-next-line @next/next/no-img-element -- inline data URI, nothing to optimize */}
            <img
              src={qrSrc}
              alt="인증 앱 등록용 QR 코드"
              width={192}
              height={192}
              className="mx-auto rounded bg-white p-2"
            />
            <div className="rounded bg-surface-container-low px-3 py-2">
              <p className="text-label-small text-on-surface-variant">설정 키 (직접 입력용)</p>
              <p className="font-mono text-body-small break-all select-all">{formatSecretForDisplay(secret)}</p>
            </div>
          </div>
        )}

        {errorMessage && (
          <p role="alert" className="text-body-small text-error">{errorMessage}</p>
        )}

        <form action={submitTotpAction} className="space-y-3">
          <input type="hidden" name="callbackUrl" value={destination} />
          <label className="block space-y-1">
            <span className="text-label-medium">인증 코드</span>
            <input
              name="code"
              required
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9 \-]*"
              maxLength={9}
              autoFocus={!passkey}
              disabled={Boolean(lockedUntil)}
              placeholder="123456"
              className="w-full rounded border border-outline-variant bg-surface px-3 py-2 text-body-large tracking-widest md-numeric focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
            />
          </label>
          <SubmitButton
            disabled={Boolean(lockedUntil)}
            // One filled button per screen: the passkey button takes that role when it is offered.
            className={passkey
              ? 'w-full rounded border border-primary px-4 py-2 text-label-large text-primary hover:bg-primary/10 disabled:opacity-50'
              : 'w-full rounded bg-primary px-4 py-2 text-label-large text-on-primary disabled:opacity-50'}
          >
            {enrolling ? '등록하고 계속' : '확인'}
          </SubmitButton>
        </form>

        <form action={logoutAction}>
          <button type="submit" className="w-full text-center text-body-small text-on-surface-variant hover:text-on-surface">
            다른 계정으로 로그인
          </button>
        </form>
        {!enrolling && relying && !passkey && (
          <p className="text-body-small text-on-surface-variant">
            로그인한 뒤 ‘내 패스키’에서 지문이나 얼굴 인식을 등록하면 다음부터 코드 없이 인증할 수 있습니다.
          </p>
        )}
        {!enrolling && (
          <p className="text-body-small text-on-surface-variant">
            휴대폰이나 등록한 기기를 잃어버렸다면 다른 관리자에게 2단계 인증 초기화를 요청해 주세요.
          </p>
        )}
      </div>
    </div>
  );
}
