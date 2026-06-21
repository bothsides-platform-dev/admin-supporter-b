# Changelog

All notable changes to this project will be documented in this file.

## [0.1.0.4] - 2026-06-22

### Added
- 구매사·PG사 영중소구간(가맹점 등급) 수정 기능 — 구매사·PG사 상세 페이지에 "영중소구간 (가맹점 등급)" 섹션이 추가되어, 관리자가 영세/중소1~3/일반 등급을 선택해 변경할 수 있음. 기존에는 워크스페이스 승인 시점에만 설정 가능했으나, 이제 승인 이후에도 상시 수정 가능. PG사도 동일하게 등급을 부여·변경할 수 있음(스키마 변경 없이 `biz_profiles` 불변 패턴 + `workspaces.biz_profile_id` 포인터 재사용). 변경 내역은 감사 로그(`workspace.grade_update`)에 기록됨.

## [0.1.0.3] - 2026-06-19

### Added
- PG 담당자 승인/거부 기능 — `/admin/pg-members` 페이지에서 `pending_approval` 상태의 PG 워크스페이스 멤버를 승인하거나 거부할 수 있음. 처리 시 담당자에게 이메일 발송 (outbox 패턴).
- 유저/워크스페이스 영구 삭제 기능 — super_admin만 접근 가능한 "위험 구역" 섹션이 유저·구매사·PG사 상세 페이지에 추가됨. 삭제 전 확인 단계(ConfirmButton) 포함.
- 사이드바에 "PG 담당자 승인" 메뉴 항목 추가.
- `AdminStatusBadge`에 `pending_approval` 상태 표시 지원 추가.

### Changed
- 스키마 미러: `outbox_event` enum에 `membership.approved`, `membership.rejected` 값 추가 (supporter-b PR #247 동기화).
- 스키마 미러: `workspace_members`에 `approval_status` 컬럼 추가 (`text`, NOT NULL, default `'approved'`).

## [0.1.0.2] - 2026-06-18

### Changed
- DB 스키마를 메인 앱(bidit)의 최신 스키마와 완전히 동기화 (프로덕션 DB가 이미 마이그레이션 완료됨). `lib/db/schema/`를 bidit과 1:1 미러로 정렬.
  - `rfps`: 레거시 현재조건 컬럼(`annual_pg_volume`, `current_fee_rate`, `current_settlement_limit`, `current_guarantee_insurance`, `current_solution`, `current_solution_detail`) 제거 → `current_terms` JSONB 문서로 통합. `share_token`, `board_visible`, `current_terms`, `hidden_from_pg`, `is_sample`, `contract_type` 추가.
  - `share_token` 컬럼 재추가 — 0.1.0.1에서 제거했던 결정을 되돌림. 프로덕션 DB에 이제 존재하므로 `42703` 위험 없음.
  - `bids`: `quote_terms`, `round` 추가 + unique 제약 `bids_rfp_pg_round_unique`로 변경.
  - `users`: `session_version`, `is_system_account` 추가.
  - `workspaces`: `canonical_pg_key`, `is_demo`, `sample_seeded_at` + `workspaces_status_idx` 추가.
  - `attachments`: `chat_message_id`, `rfp_team_message_id` 소유 컬럼 + CHECK/인덱스 확장.
  - `notifications`: `workspace_id` nullable 허용 (유저 레벨 알림).
  - `verification_tokens`: `attempts` 추가. enum 추가/확장 동기화.

### Added
- 신규 테이블 정의 미러: `chat_conversations`, `chat_messages`, `chat_conversation_reads`, `chat_message_templates`, `rfp_team_messages`, `rfp_team_message_reads`, `rfp_pg_requests`, `rfp_requote_requests`, `bid_quote_templates`, `audit_logs`, `login_attempts`.

## [0.1.0.1] - 2026-06-10

### Fixed
- `/review/[id]` 페이지가 "This page couldn't load" 오류로 로드되지 않는 문제 수정 — 프로덕션 DB에 존재하지 않는 `share_token` 컬럼이 Drizzle 스키마에 포함되어 모든 `workspaces` 및 `rfps` 쿼리가 `column "share_token" does not exist` (PostgreSQL 42703) 오류를 발생시켰음. 해당 컬럼 정의를 admin 스키마에서 제거.

## [0.1.0.0] - 2026-06-10

### Added
- 초기 admin-supporter-b 앱 (bidit에서 추출)
