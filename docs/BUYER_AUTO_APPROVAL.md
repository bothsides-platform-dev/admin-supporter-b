# 영세 확인 구매사 자동 승인 표시

공유 DB 마이그레이션의 소유자는 `bidit` 저장소다. 배포는 `bidit/scripts/migrations/20261020-buyer-auto-approval.sql` 커밋 → 관리자 서비스 → 구매사 서비스 순서다. 활성화 조건·외부 응답 실측 기록은 `bidit/docs/BUYER_AUTO_APPROVAL.md`를 따른다. 최초 배포는 구매사 서비스의 `BUYER_SOLE_AUTO_APPROVAL_ENABLED=false`를 유지한다.

관리자는 `api_confirmed`를 **자동 확인**으로 읽는다. 자동 승인 신청은 기존 `approved` 상태이므로 승인 필터에서 조회하고 심사 대기 필터와 다음 대기 건에서는 제외한다.

처리 이력은 기존 신청 ID 기준 `admin_audit_logs` 조회를 사용한다. `workspace.auto_approve` 사건은 **자동 승인 완료**와 공급자·사업자번호·조회 시각·적용 기준일·영세 판정을 표시한다. 사람의 수동 승인은 기존대로 동작한다.

기능 중지 시 기존 승인 이력은 유지한다. 출처 enum을 삭제하거나 과거 신청을 재심사 대기로 일괄 변경하지 않는다.
