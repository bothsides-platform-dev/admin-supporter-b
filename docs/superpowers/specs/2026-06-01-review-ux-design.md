# 입점 심사 UX 개선 설계

**날짜**: 2026-06-01  
**범위**: 심사 상세 페이지 상태별 액션 분기 + 처리 이력 표시  
**제외**: review_pending 전환 액션, 어드민 노트, 심사 타임라인 (차후)

---

## 1. 배경 및 목표

현재 심사 상세 페이지(`/review/[id]`)는 `submitted` 상태일 때만 액션 영역을 보여준다. `needs_more_info` 상태(보완 요청 후)에서 admin이 재심사할 수 있는 UI가 없다. 또한 반려·보완요청 시 입력한 사유가 DB에 저장되지만 화면에 표시되지 않아 전달 내용 파악이 어렵다.

이번 개선으로:
- `submitted`, `needs_more_info` 상태 모두에서 승인·반려·보완요청 액션 가능
- `rejected`, `needs_more_info` 상태에서 처리 이력(사유·처리일·처리자) 표시
- 액션 카드 3개를 시각적으로 분리해 실수 방지

---

## 2. 범위

| # | 기능 | 유형 |
|---|---|---|
| 1 | 처리 이력 섹션 추가 | 기존 개선 |
| 2 | 액션 카드 분리 + 상태 조건 확장 | 기존 개선 |

**변경 파일**: `app/(protected)/review/[id]/page.tsx` 1개  
**DB 마이그레이션**: 없음 — `verificationApplications.reason`, `reviewedAt`, `reviewedBy` 이미 존재  
**서버 액션 변경**: 없음

---

## 3. 설계

### 3.1 처리 이력 섹션

표시 조건: `application.status === 'needs_more_info' || application.status === 'rejected'`

위치: 신청 정보 섹션 바로 아래

표시 필드:
- 상태 배지 (`AdminStatusBadge`)
- 처리일: `application.reviewedAt` (toLocaleString)
- 처리자: `application.reviewedBy`
- 사유: `application.reason`

데이터 출처: `getApplicationDetail` 반환값의 `application` 객체 — 쿼리 변경 없음

### 3.2 액션 카드 분리

**표시 조건 변경**
```
기존: application.status === 'submitted'
변경: ['submitted', 'needs_more_info'].includes(application.status)
```

**카드 구성 (3개)**

| 카드 | 테두리 색 | 내용 | 버튼 |
|---|---|---|---|
| 승인 | primary | buyer: 등급 select (required) / pg: 없음 | 승인 (primary) |
| 반려 | error | 사유 textarea (required) | 반려 (error outline) |
| 보완 요청 | outline-variant | 사유 textarea (required) | `submitted`: "보완 요청" / `needs_more_info`: "재요청" |

**보완 요청 버튼 레이블 분기**
- `submitted` → "보완 요청"
- `needs_more_info` → "재요청"

서버 액션은 동일: `requestMoreInfoAction`

---

## 4. 제외 항목 (차후)

- `review_pending` 상태 전환 액션 (심사 시작 버튼)
- 어드민 노트 섹션
- 상태 전환 타임라인
