# Admin 관리 기능 개선 설계

**날짜**: 2026-06-01  
**범위**: 회원관리 신규 + 목록 검색·필터 개선 + 워크스페이스 상세 멤버 섹션 개선  
**제외**: 대시보드 지표 보강, 입점 심사 UX 개선 (차후 스프린트)

---

## 1. 배경 및 목표

현재 admin 패널은 워크스페이스(회사) 단위를 관리하지만 **개별 유저 계정을 관리하는 UI가 없다**. 또한 구매사·판매사·RFP 목록에 검색/필터가 없어 데이터가 많아질수록 운영 효율이 떨어진다.

이번 개선으로:
- 개별 유저 계정 조회·상태 변경·워크스페이스 멤버 제외 가능
- 모든 목록 화면에서 검색·필터로 빠르게 원하는 항목 접근 가능
- 구매사·판매사 상세에서 해당 워크스페이스 멤버 목록 확인·관리 가능

---

## 2. 범위

| # | 기능 | 유형 |
|---|---|---|
| 1 | 회원관리 (`/users`, `/users/[id]`) | 신규 |
| 2 | 목록 검색·필터 (buyers / sellers / rfps / review) | 기존 개선 |
| 3 | 워크스페이스 상세 멤버 섹션 (buyers/[id], sellers/[id]) | 기존 개선 |

DB 마이그레이션 없음 — `users`, `workspace_members` 테이블 이미 존재.

---

## 3. 설계

### 3.1 회원관리 (신규)

#### 라우트

| 경로 | 역할 |
|---|---|
| `/users` | 유저 목록 |
| `/users/[id]` | 유저 상세 |

AdminShell 사이드바 NAV에 `{ href: '/users', label: '회원' }` 추가.

#### `/users` 목록 페이지

URL 파라미터:
- `?q=` — 이름 또는 이메일 부분 검색 (DB `ilike`)
- `?status=` — `all` / `active` / `suspended`

테이블 컬럼: 이름 | 이메일 | 상태 | 소속 워크스페이스 수 | 가입일

#### `/users/[id]` 상세 페이지

섹션:
1. **유저 정보 카드** — 이름, 이메일, 전화번호, 가입일, 상태 배지
2. **계정 상태 액션** — 계정 정지 버튼 (`suspendUserAction`) / 활성화 버튼 (`unsuspendUserAction`)
3. **워크스페이스 멤버십 테이블** — 워크스페이스명 | 유형(구매사/PG사) | 역할(admin/member) | 가입일 | [제외] 버튼
4. **어드민 노트** — 기존 `adminNotes` 인프라 재사용 (`entityType = 'user'`)

#### 신규 파일

```
lib/server/queries/admin/users.ts
  - listUsers(opts: { q?: string; status?: string }): Promise<UserRow[]>
  - getUserDetail(userId: string): Promise<UserDetailRow | null>

lib/server/actions/admin/suspendUserAction.ts
lib/server/actions/admin/unsuspendUserAction.ts
lib/server/actions/admin/removeWorkspaceMemberAction.ts

app/(protected)/users/page.tsx
app/(protected)/users/[id]/page.tsx
```

#### 수정 파일

```
components/AdminShell.tsx   — NAV에 회원 항목 추가
```

#### 에러 처리

- 존재하지 않는 유저 ID → `notFound()`
- 마지막 admin 멤버 제외 시도 → 서버 액션에서 에러 반환, 화면에 메시지 표시
- 이미 정지된 계정에 정지 액션 → 서버에서 no-op, 성공 응답

#### 감사 로그

`suspendUserAction`, `unsuspendUserAction`, `removeWorkspaceMemberAction` 모두 `adminAuditLogs`에 기록.

---

### 3.2 목록 검색·필터 (기존 개선)

#### 구현 방식

`<form method="GET">` 기반 URL search params — 서버사이드 필터링, JS 불필요, 북마크 가능.

#### 적용 대상

| 페이지 | 검색 (`?q=`) | 상태 필터 (`?status=`) | 추가 필터 |
|---|---|---|---|
| `/buyers` | 회사명 | pending/active/suspended | — |
| `/sellers` | 회사명 | pending/active/suspended | — |
| `/rfps` | 제목·코드 | draft/sent/closed/cancelled/awarded | — |
| `/review` | — | submitted/review_pending/needs_more_info/approved/rejected | `?type=` (buyer/pg) |

#### UI 패턴 (모든 목록 공통)

```tsx
<form method="GET" className="flex gap-2 mb-4">
  <input name="q" defaultValue={q} placeholder="검색..." className="..." />
  <select name="status" defaultValue={status}>
    <option value="">전체</option>
    ...
  </select>
  <button type="submit">검색</button>
</form>
```

#### 수정 파일

```
lib/server/queries/admin/buyers.ts    — listBuyers에 { q?, status? } 추가
lib/server/queries/admin/sellers.ts   — listSellers에 { q?, status? } 추가
lib/server/queries/admin/rfps.ts      — listRfps에 { q?, status? } 추가
lib/server/queries/admin/review.ts    — listPendingApplications → listApplications({ status?, type? })
app/(protected)/buyers/page.tsx
app/(protected)/sellers/page.tsx
app/(protected)/rfps/page.tsx
app/(protected)/review/page.tsx
```

---

### 3.3 워크스페이스 상세 멤버 섹션 (기존 개선)

#### 신규 공유 쿼리

```typescript
// lib/server/queries/admin/workspaceMembers.ts
getWorkspaceMembers(workspaceId: string): Promise<{
  userId: string
  name: string
  email: string
  role: 'admin' | 'member'
  joinedAt: Date
}[]>
```

#### 멤버 테이블 UI

컬럼: 이름 | 이메일 | 역할 | 가입일 | [제외]

- [제외] → `removeWorkspaceMemberAction(workspaceId, userId)` (Section 1과 공유)
- 마지막 admin은 [제외] 비활성화

#### 수정 파일

```
lib/server/queries/admin/workspaceMembers.ts   — 신규
app/(protected)/buyers/[id]/page.tsx           — 멤버 섹션 추가
app/(protected)/sellers/[id]/page.tsx          — 멤버 섹션 추가
```

---

## 4. 파일 변경 요약

| 파일 | 유형 |
|---|---|
| `lib/server/queries/admin/users.ts` | 신규 |
| `lib/server/queries/admin/workspaceMembers.ts` | 신규 |
| `lib/server/actions/admin/suspendUserAction.ts` | 신규 |
| `lib/server/actions/admin/unsuspendUserAction.ts` | 신규 |
| `lib/server/actions/admin/removeWorkspaceMemberAction.ts` | 신규 |
| `app/(protected)/users/page.tsx` | 신규 |
| `app/(protected)/users/[id]/page.tsx` | 신규 |
| `components/AdminShell.tsx` | 수정 |
| `lib/server/queries/admin/buyers.ts` | 수정 |
| `lib/server/queries/admin/sellers.ts` | 수정 |
| `lib/server/queries/admin/rfps.ts` | 수정 |
| `lib/server/queries/admin/review.ts` | 수정 |
| `app/(protected)/buyers/page.tsx` | 수정 |
| `app/(protected)/sellers/page.tsx` | 수정 |
| `app/(protected)/rfps/page.tsx` | 수정 |
| `app/(protected)/review/page.tsx` | 수정 |
| `app/(protected)/buyers/[id]/page.tsx` | 수정 |
| `app/(protected)/sellers/[id]/page.tsx` | 수정 |

총 신규 7개, 수정 11개. DB 마이그레이션 없음.

---

## 5. 제외 항목 (차후)

- 대시보드 지표 보강 (트렌드, 유동성 지표)
- 입점 심사 UX 개선 (심사 상세 레이아웃, 문서 뷰어)
