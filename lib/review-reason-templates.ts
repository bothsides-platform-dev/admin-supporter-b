/**
 * 심사 사유 입력을 돕는 문구 초안.
 *
 * 사유는 신청자에게 그대로 전달되므로, 아래 문구는 운영 담당자가 확정하기 전의
 * 초안이다. 고르면 입력란에 채워질 뿐이고 보내기 전에 고쳐 쓸 수 있다.
 * 문구를 바꾸려면 이 파일만 고치면 된다.
 */
export const REJECT_REASON_TEMPLATES: readonly string[] = [
  '사업자등록 정보를 확인할 수 없습니다.',
  '서비스 이용 대상에 해당하지 않습니다.',
  '같은 사업자로 이미 접수된 신청이 있습니다. 기존 신청으로 진행해 주세요.',
];

export const MORE_INFO_REASON_TEMPLATES: readonly string[] = [
  '사업자등록번호를 다시 확인해 주세요.',
  '회사명을 사업자등록증의 상호와 같게 수정해 주세요.',
  '담당자 연락처를 확인할 수 있도록 보완해 주세요.',
];

export const NAME_CHANGE_REJECT_REASON_TEMPLATES: readonly string[] = [
  '요청하신 이름이 사업자등록증의 상호와 다릅니다.',
  '변경 사유를 확인할 수 없습니다.',
];
