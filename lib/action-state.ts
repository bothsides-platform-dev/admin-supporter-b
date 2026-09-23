/**
 * 폼/버튼 서버 액션의 결과를 UI에 보여주기 위한 공통 상태.
 * 서버 액션은 `{ ok, error }` 코드를 반환하고, 페이지의 래퍼가 이를
 * 사람이 읽을 수 있는 메시지로 바꿔 클라이언트(ActionForm/ConfirmButton)에 넘긴다.
 */
export type ActionState =
  | { status: 'idle' }
  | { status: 'success'; message: string }
  | { status: 'error'; message: string };

export const IDLE_ACTION_STATE: ActionState = { status: 'idle' };

const ERROR_MESSAGES: Record<string, string> = {
  INVALID_INPUT: '입력값을 확인해 주세요.',
  WORKSPACE_SUSPENDED: '정지된 워크스페이스는 승인할 수 없습니다. 정지 사유를 먼저 확인해 주세요.',
  REASON_REQUIRED: '사유를 입력해 주세요.',
  BODY_REQUIRED: '내용을 입력해 주세요.',
  NOT_FOUND: '대상을 찾을 수 없습니다. 새로고침 후 다시 확인해 주세요.',
  INVALID_DAYS: '연장 일수는 1~30일 사이의 정수여야 합니다.',
  GRADE_REQUIRED: '등급을 선택해 주세요.',
  INVALID_GRADE: '올바르지 않은 등급입니다.',
  WORKSPACE_NOT_FOUND: '워크스페이스를 찾을 수 없습니다.',
  MEMBER_NOT_FOUND: '이미 제외된 멤버입니다. 새로고침해 주세요.',
  LAST_ADMIN: '마지막 관리자는 제외할 수 없습니다.',
  OWNER_EMAIL_NOT_VERIFIED: '신청자(오너)의 이메일 인증이 완료되지 않아 승인할 수 없습니다.',
  ALREADY_PROCESSED: '이미 처리된 요청입니다. 새로고침해 주세요.',
};

const FALLBACK_ERROR_MESSAGE = '처리에 실패했습니다. 다시 시도해 주세요.';

export function actionSuccess(message: string): ActionState {
  return { status: 'success', message };
}

export function actionFailure(code: string): ActionState {
  return { status: 'error', message: ERROR_MESSAGES[code] ?? FALLBACK_ERROR_MESSAGE };
}

export function toActionState(
  result: { ok: true } | { ok: false; error: string },
  successMessage: string,
): ActionState {
  return result.ok ? actionSuccess(successMessage) : actionFailure(result.error);
}
