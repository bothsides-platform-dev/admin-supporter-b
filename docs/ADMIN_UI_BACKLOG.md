# 어드민 UI 백로그

2026-11-16 에 상용 백오피스의 공개 가이드와 현재 화면을 대조해 뽑은 적용점 가운데, 아직 구현하지 않은 것을 모아 둔다. 우선순위는 운영자 작업 빈도 기준이다(토스 운영툴 글의 기준: 발생 빈도·건당 소요 시간·담당자 수·휴먼 에러 위험).

## 구현한 것

| 적용점 | 레퍼런스 | 위치 |
|---|---|---|
| 공통 페이지 머리(브레드크럼·제목·상태·액션) | Stripe DetailPage | `components/AdminPageHeader.tsx` |
| 로딩 스켈레톤, 셸 안 404 | Stripe loading 패턴 | `app/(protected)/loading.tsx`, `not-found.tsx` |
| 페이지별 탭 제목 | 일반 관행 | 각 `page.tsx` 의 `metadata` / `generateMetadata` |
| 표·페이지네이션 통일 | 토스 패턴 시스템화, Adobe data table | `components/AdminDataTable.tsx`, `AdminListPagination.tsx` |
| 심사 큐: 대기 일수, 처리 대기·오래된 순 기본 | 리뷰 큐 패턴 | `app/(protected)/review/page.tsx`, `lib/review-queue.ts` |
| 상태별 보기 탭, 적용된 필터 칩, 빈 상태의 필터 초기화 | Basis saved views(시스템 뷰), Stripe filter controls | `components/AdminListControls.tsx`, `AdminViewTabs.tsx`, `AdminAppliedFilters.tsx` |
| 일괄 처리 바(전체 선택·선택 건수) | Adobe data table | `components/BulkSelection.tsx` |
| ID·이메일 복사 | Ant ProDescriptions copyable | `components/CopyableValue.tsx` |
| 처리 없이 다음 대기 건으로 건너뛰기 | 리뷰 큐 패턴 | `lib/server/queries/admin/nextReview.ts` 의 `skip` |
| 반려·보완 사유 문구(초안 — 운영 확정 필요) | 자체 제안 | `lib/review-reason-templates.ts`, `components/ReasonTemplatePicker.tsx` |
| 메뉴 대기 건수 뱃지 | 리뷰 큐 패턴 | `app/(protected)/layout.tsx`, `components/AdminShell.tsx` |
| 긴 상세의 섹션 목차(RFP 는 2열) | Stripe DetailPage | `components/AdminSectionNav.tsx` |

## 남은 것

| 적용점 | 레퍼런스 | 현재 상태 | 순위 |
|---|---|---|---|
| 전역 검색(⌘K): 회사명·이메일·RFP 코드·사업자번호 | 2차 자료 | 없음 | P2 |
| 열 머리글 클릭 정렬, 행 전체 클릭 | Stripe DataTable | 정렬은 select, 이름만 링크 | P2 |
| CSV 내보내기 — 권한과 감사 로그가 먼저 필요하다(개인정보 반출) | Shopify secondary actions | 없음 | P2 |
| 감사 로그 대상을 이름으로 표시 | 출처 없음 | UUID 앞 8자 | P2 |
| 대시보드 카드에 SLA 초과 건수 — SLA 기준값부터 정해야 한다 | 리뷰 큐 패턴 | 총 건수만 | P2 |
| RFP 상세 견적 목록 표를 공통 표로 이전 | — | 열이 많아 자체 표 유지 | P2 |
| 담당자 배정·잠금 — bidit 스키마 변경이 필요하다 | 모더레이션 큐 자료 | 없음 | 보류 |
| 페이지당 건수·페이지 점프·고정 머리글 | Adobe | 25건 고정 | P3 |

## 하지 않기로 한 것

- 사용자 저장 뷰, 열 표시·순서·너비 조절. Basis 는 단순한 표에 저장 뷰를 쓰지 말라고 하고, Adobe 의 열 제어는 30열 표가 대상이다. 어드민 목록은 3~6열이다.
- 무한 스크롤, 인라인 편집, UI 라이브러리 도입, 토스트. 결과 메시지는 폼 옆 인라인 표시(`ActionMessage`)로 충분하다.

## 조사 한계

- Shopify Polaris 의 index table 가이드는 원문을 읽지 못해 근거에서 뺐다. Ant Design Pro 는 비공식 미러만 확인했다.
- 한국어 공개 자료는 토스 글 1편이고 화면별 세부 규칙은 없다.
- 리뷰 큐 자료는 패턴 가이드 1건으로, 공식 디자인 시스템 문서가 아니다.

## 출처

- Stripe Apps: [Full-page apps](https://docs.stripe.com/stripe-apps/patterns/full-page-apps.md), [Filter controls](https://docs.stripe.com/stripe-apps/patterns/filter-controls.md)
- Shopify: [Resource index template](https://shopify.dev/docs/api/app-home/patterns/templates/resource-index.md)
- Adobe Commerce Admin: [Data table](https://developer.adobe.com/commerce/admin-developer/pattern-library/displaying-data/datatable)
- Basis: [Saved views](https://design.basis.com/patterns/saved-views)
- 토스: [잘 만든 시스템 하나로 미친 효율 얻는 방법](https://toss.tech/article/how-to-make-marvelous-productivity-with-well-made-system)
- UX Patterns Guide: [Review queue 비교](https://uxpatternsguide.com/compare/change-review-vs-review-before-submit-vs-approval-workflow-vs-review-queue/)
