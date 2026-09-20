# 장기합의서 수수료 기준

`/agreement-rates`에서 PG사를 선택하고 결제수단·가맹점 등급별 표준 수수료를 등록한다. 최종 수수료는 bidit에서 선정된 견적을 사용하며 이 화면에서 바꾸지 않는다.

- 정률 입력은 퍼센트, 저장은 소수 요율이다(2 → 0.02). 가상계좌는 건당 원 정수다.
- 빈칸은 미등록, 0은 명시적인 0이다. 신규 PG에 기본 요율을 자동 적용하지 않는다.
- 직접입력 결제수단은 이름·요율 입력행으로 등록한다. 구매사가 입력한 이름의 앞뒤 공백과 줄바꿈을 포함해 원문 그대로 저장한다.
- 기존 요율을 수정하지 않은 채 다른 항목을 저장해도 원래 숫자를 보존한다. 화면 표시를 위한 퍼센트 변환이 저장 요율을 반올림하지 않는다.
- 변경은 PG workspace 행 잠금과 버전 비교로 직렬화하며, 이전 버전의 저장은 거부한다. 전후 값은 `admin_audit_logs`의 `agreement_rates.saved`에 저장한다.
- 같은 PG workspace 잠금을 bidit의 합의서 발송 준비도 사용한다. 기존 발송 문서는 변경되지 않는다.

## 배포

DDL 소유자는 bidit이다. 먼저 bidit의 `scripts/migrations/long-term-agreements.sql`을 적용한 뒤 이 콘솔을 배포하고 표준 요율을 등록한다. 마지막으로 bidit 공통 합의서 버전을 배포한다. 이 콘솔에서 DDL을 임의 생성/삭제하지 않는다. 상세 운영 순서는 bidit의 `docs/LONG_TERM_AGREEMENT_ROLLOUT.md`를 따른다.

저장 스키마와 요율 키의 정식 짝은 bidit `lib/contract-doc/agreement.ts`와 이 레포 `lib/agreement-rates.ts`다. 결제수단/등급이 추가되면 두 레포를 함께 확인한다. 기존 PG 추천 기준(`/pg-recommendations`)의 예상 수수료 정책과는 별개다.

검증: `pnpm test` · `pnpm typecheck` · `pnpm lint`.
