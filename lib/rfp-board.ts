export const BOARD_STAGES = {
  consulting: '상담·견적 대기',
  next_pg: '다음 상담 확인',
  selection: '견적 검토',
  awarded: 'PG 선정',
  signing: '서명 절차',
  completed: '서명 완료',
  ended: '거래 종료',
} as const;
export type BoardStage = keyof typeof BOARD_STAGES;
export const REVIEW_LABELS = {
  requested: '상담 요청',
  reviewing: 'PG 검토 중',
  quoted: '견적 제시',
  rejected: 'PG 거절',
  withdrawn: 'PG 철회',
  buyer_ended: '구매사 상담 종료',
} as const;
export const SIGNING_LABELS = {
  awaiting_pg_template: '서명 요청 준비',
  sent: '서명 요청 발송',
  in_progress: '서명 진행',
  completed: '서명 완료',
  declined: '서명 거절',
  expired: '서명 기한 만료',
  canceled: '서명 요청 취소',
  send_failed: '서명 요청 발송 실패',
} as const;
export type ReviewStatus = keyof typeof REVIEW_LABELS;
export type SigningStatus = keyof typeof SIGNING_LABELS;
export type BoardParams = { q?: string; pg?: string; type?: string; status?: string; page?: string };
export const BOARD_PAGE_SIZE = 8;

export function boardHref(params: BoardParams, stage = params.status, page = params.page) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries({
    q: params.q,
    pg: params.pg,
    type: params.type,
    status: stage,
    page,
  })) {
    if (typeof value === 'string' && value) query.set(key, value);
  }
  return query.size ? `/rfps/board?${query}` : '/rfps/board';
}
