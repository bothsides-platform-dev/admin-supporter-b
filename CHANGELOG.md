# Changelog

All notable changes to this project will be documented in this file.

## [0.1.0.1] - 2026-06-10

### Fixed
- `/review/[id]` 페이지가 "This page couldn't load" 오류로 로드되지 않는 문제 수정 — 프로덕션 DB에 존재하지 않는 `share_token` 컬럼이 Drizzle 스키마에 포함되어 모든 `workspaces` 및 `rfps` 쿼리가 `column "share_token" does not exist` (PostgreSQL 42703) 오류를 발생시켰음. 해당 컬럼 정의를 admin 스키마에서 제거.

## [0.1.0.0] - 2026-06-10

### Added
- 초기 admin-supporter-b 앱 (bidit에서 추출)
