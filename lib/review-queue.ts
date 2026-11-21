/**
 * 입점 심사 목록의 "처리 대기" 묶음. `getNextReviewApplicationId` 가 상태 필터
 * 없이 쓰는 기본 집합과 같아야 목록 순서와 "다음 대기 건" 순서가 어긋나지 않는다.
 */
export const REVIEW_OPEN_STATUS = 'open';
export const REVIEW_OPEN_STATUSES = ['submitted', 'review_pending'] as const;

/** 운영자 처리를 기다리는 상태 — 목록에 대기 일수를 보여 주는 대상. */
export const REVIEW_WAITING_STATUSES: readonly string[] = ['submitted', 'review_pending', 'needs_more_info'];
