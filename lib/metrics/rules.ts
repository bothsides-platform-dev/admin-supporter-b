// 지표 집계의 제외 조건과 "활동"으로 인정하는 행동의 단일 출처.
// 정의가 바뀌면 docs/METRICS.md 도 함께 고친다.

/**
 * 이름에 이 토큰이 (대소문자 무시) 들어 있으면 테스트 워크스페이스로 본다.
 * bidit lib/features/test-pg.ts 의 TEST_PG_NAME_TOKENS 와 같은 규칙이며,
 * 지표에서는 구매사 워크스페이스에도 적용한다.
 */
export const TEST_NAME_TOKENS = ['test', '테스트'] as const;

export function isTestWorkspaceName(name: string): boolean {
  const lower = name.toLowerCase();
  return TEST_NAME_TOKENS.some((token) => lower.includes(token));
}

/**
 * 내부 직원 계정으로 볼 이메일 도메인. 쉼표로 구분한다.
 * 예: METRICS_EXCLUDED_EMAIL_DOMAINS="example.com,example.co.kr"
 */
export function excludedEmailDomains(
  raw: string | undefined = process.env.METRICS_EXCLUDED_EMAIL_DOMAINS,
): string[] {
  return (raw ?? '')
    .split(',')
    .map((domain) => domain.trim().toLowerCase().replace(/^@/, ''))
    .filter(Boolean);
}

/** 도메인이 정확히 일치할 때만 내부 계정으로 본다 (하위 도메인은 따로 적는다). */
export function isExcludedEmail(email: string, domains: readonly string[]): boolean {
  const at = email.lastIndexOf('@');
  if (at < 0 || domains.length === 0) return false;
  return domains.includes(email.slice(at + 1).toLowerCase());
}

/**
 * 사람이 직접 한 행동만 활동으로 센다 (audit_logs.action 허용 목록).
 *
 * 넣지 않는 것:
 * - 가입·합류 때 자동으로 남는 기록 (workspace.create, workspace.invite_accept)
 * - 서명 공급자·폴러가 남기는 기록 (signing.completed, signing.canceled_by_provider 등)
 * - 워크스페이스와 무관한 계정 작업 (auth.*)
 *
 * 허용 목록이라 bidit 에 새 action 이 생기면 여기에 추가해야 활동으로 잡힌다.
 */
export const HUMAN_ACTIONS = [
  'rfp.create',
  'rfp.send_invitations',
  'rfp.requote',
  'rfp.matching_next',
  'rfp.award',
  'rfp.close',
  'rfp.cancel',
  'rfp.board_visibility',
  'rfp.review_reviewing',
  'rfp.review_rejected',
  'bid.submit',
  'bid.withdraw',
  'workspace.member_invite',
  'workspace.member_invite_resend',
  'workspace.member_invite_cancel',
  'workspace.member_role_change',
  'workspace.member_remove',
  'workspace.name_change_request',
  'signing.sent',
  'signing.resent',
  'signing.reminded',
  'signing.canceled',
] as const;
