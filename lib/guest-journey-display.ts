import type { JourneyEvent } from "./server/queries/admin/guestJourneys";
// Display vocabulary mirrors bidit journey-contract; wire identifiers remain unchanged.
const labels: Record<string, string> = {
  website: "홈페이지",
  solution: "운영 솔루션",
  industry: "업종",
  products: "주요 상품",
  sellers: "입점 판매자",
  cash: "환금성 상품",
  price: "최고 가격대",
  sales: "판매 방식",
  delivery: "배송·서비스 기간",
  contract: "계약 유형",
  "current-pgs": "현재 PG사",
  payment: "결제수단",
  annual: "연간 거래액",
  fee: "현재 수수료",
  limit: "정산한도",
  insurance: "보증보험",
  cycle: "정산주기",
  title: "제목",
  memo: "메모",
  attachments: "첨부",
  landing: "랜딩",
  quote_start: "견적 작성",
  draft_complete: "작성 완료",
  choose_login: "로그인 선택",
  choose_signup: "가입 선택",
  member_return: "견적 작성 복귀",
  email: "이메일",
  company: "사업자 정보",
  profile: "프로필",
  phone: "휴대폰",
  account_created: "가입 완료",
  auto_login: "자동 로그인",
  email_verification: "이메일 인증",
  approval_pending: "심사 대기 화면",
  app_entry: "앱 진입",
  entry: "견적 작성 진입",
  business: "사업자 확인",
  questions: "견적 내용",
  recommendation: "PG 추천",
  review: "최종 요청",
  submitted: "요청 완료",
};

export const journeyStep = (step: string) => labels[step] ?? step;
export const journeyStatus = (status: string) => status === 'submitted' ? '요청 완료' : status === 'deleted' ? '삭제됨' : '요청 전';
export function journeyAction(event: JourneyEvent): string {
  if (event.name === 'sign_up' || event.name === 'quote_request_submitted') return '완료 (서버 확인)';
  if (event.name === 'funnel_step_error') return `입력 오류 (${event.error_code ?? 'UNKNOWN'})`;
  if (event.progression === 'skip') return '건너뛰기';
  if (event.name === 'funnel_step_complete') return '입력 완료';
  if (event.name === 'funnel_cta_click') return '선택·시도';
  if (event.name === 'funnel_step_view') return '화면 관측';
  return '알 수 없는 기록';
}
export const journeyTime = (at: Date | string) => new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
}).format(new Date(at));
