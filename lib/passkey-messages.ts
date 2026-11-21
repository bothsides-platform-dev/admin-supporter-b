import { MAX_PASSKEYS_PER_ADMIN, PASSKEY_LABEL_MAX } from './auth/passkey-limits';
import type { CeremonyFailure } from './webauthn-client';

/** Server result codes (lib/auth/passkeys.ts and its actions) → what the admin reads. */
const SERVER_MESSAGES: Record<string, string> = {
  PASSKEY_UNAVAILABLE: '이 환경에서는 패스키를 사용할 수 없습니다.',
  CHALLENGE_EXPIRED: '인증 준비가 만료되었습니다. 다시 시도해 주세요.',
  UNKNOWN_CREDENTIAL: '이 계정에 등록되지 않은 패스키입니다. 다른 패스키나 인증 앱 코드를 사용해 주세요.',
  PASSKEY_REJECTED: '패스키를 확인하지 못했습니다. 다시 시도해 주세요.',
  NOT_READY: '인증 설정이 바뀌었습니다. 화면 안내에 따라 다시 진행해 주세요.',
  INVALID_LABEL: `기기 이름을 1~${PASSKEY_LABEL_MAX}자로 입력해 주세요.`,
  PASSKEY_LIMIT: `패스키는 ${MAX_PASSKEYS_PER_ADMIN}개까지 등록할 수 있습니다. 쓰지 않는 패스키를 삭제한 뒤 다시 시도해 주세요.`,
  INVALID_CODE: '인증 코드가 맞지 않습니다. 방금 로그인에 쓴 코드는 다시 쓸 수 없으니, 앱에 새 코드가 표시되면 입력해 주세요.',
  LOCKED: '인증 코드를 여러 번 잘못 입력해 잠시 잠겼습니다. 15분 뒤 다시 시도해 주세요.',
  PASSKEY_ALREADY_REGISTERED: '이미 등록된 패스키입니다.',
};
const FALLBACK = '처리에 실패했습니다. 다시 시도해 주세요.';

export function passkeyServerMessage(code: string): string {
  return SERVER_MESSAGES[code] ?? FALLBACK;
}

/** What the browser's passkey dialog reported. A cancelled dialog is the user's choice, not an error. */
export const CEREMONY_MESSAGES: Record<CeremonyFailure, string> = {
  CANCELLED: '기기 인증이 취소되었거나 시간이 지났습니다.',
  ALREADY_REGISTERED: '이 기기에는 이 계정의 패스키가 이미 있습니다.',
  NOT_ALLOWED_HERE: '이 주소에서는 패스키를 사용할 수 없습니다. 접속 주소를 확인해 주세요.',
  FAILED: '기기 인증에 실패했습니다. 다시 시도해 주세요.',
};

export const PASSKEY_NETWORK_MESSAGE = '서버에 연결하지 못했습니다. 네트워크를 확인한 뒤 다시 시도해 주세요.';
