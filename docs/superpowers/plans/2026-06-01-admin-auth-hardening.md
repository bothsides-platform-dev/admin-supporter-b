# Admin Auth 보안 강화 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 하드코딩된 이메일 화이트리스트를 환경변수로 이전하고, 매 요청마다 env 체크로 즉시 무효화를 구현하며, Next.js middleware로 edge 보호를 추가한다.

**Architecture:** `ADMIN_EMAILS` env var이 신뢰의 원천. `signIn` 콜백(로그인 시)과 `requireAdminSession()`(매 요청 시) 둘 다 env를 체크해 이중 방어. `ADMIN_SUPER_EMAILS`로 super_admin 역할 구분. Next.js middleware는 JWT 존재 여부만 edge에서 체크하고 실제 allowlist 검증은 Node 런타임의 `requireAdminSession()`에서 처리. env 수정 + 재배포 시 기존 JWT 보유자도 즉시 차단.

**Tech Stack:** Next.js 16 App Router middleware, NextAuth v5-beta

---

## 파일 맵

| 상태 | 파일 | 변경 내용 |
|------|------|----------|
| 수정 | `auth.ts` | 하드코딩 제거 → `ADMIN_EMAILS` env 파싱 |
| 수정 | `lib/auth/admin-session.ts` | 매 요청 env 체크 + role 반환 추가 |
| 신규 | `middleware.ts` | edge 레벨 JWT 존재 체크 |
| 수정 | `.env.local` (로컬) / 배포 env | `ADMIN_EMAILS`, `ADMIN_SUPER_EMAILS` 추가 |

---

## Task 1: auth.ts — 하드코딩 제거 및 env 연동

**Files:**
- Modify: `auth.ts`

`ALLOWED_EMAILS` 배열 삭제. `signIn` 콜백에서 `ADMIN_EMAILS` env var을 파싱해 체크.

- [ ] **Step 1: `auth.ts` 전체 교체**

```ts
import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';

function getAllowedEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [Google],
  callbacks: {
    signIn({ user }) {
      return getAllowedEmails().includes((user.email ?? '').toLowerCase());
    },
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
});
```

- [ ] **Step 2: `.env.local`에 변수 추가**

```bash
# 허용할 어드민 이메일 (쉼표 구분)
ADMIN_EMAILS=bothsides2026@gmail.com,yeonseong.dev@gmail.com,skcjfdnd1996@gmail.com,ihopyhapy29@gmail.com

# super_admin 역할 이메일 (ADMIN_EMAILS의 부분집합)
ADMIN_SUPER_EMAILS=bothsides2026@gmail.com,yeonseong.dev@gmail.com
```

배포 환경(Vercel 등)에도 동일하게 설정.

- [ ] **Step 3: typecheck 통과 확인**

```bash
pnpm typecheck
```

Expected: 에러 없음

- [ ] **Step 4: 수동 검증**

```bash
pnpm dev
```

1. `ADMIN_EMAILS`에 없는 Google 계정으로 로그인 → `/login?error=AccessDenied` 확인
2. 목록에 있는 계정으로 로그인 → 대시보드 진입 확인

- [ ] **Step 5: Commit**

```bash
git add auth.ts
git commit -m "feat: replace hardcoded email allowlist with ADMIN_EMAILS env var"
```

---

## Task 2: requireAdminSession 업그레이드 — 매 요청 env 체크 + role 반환

**Files:**
- Modify: `lib/auth/admin-session.ts`

JWT가 유효해도 `ADMIN_EMAILS`에 없으면 차단. env 수정 + 재배포 후 즉시 기존 세션 무효화. `ADMIN_SUPER_EMAILS`로 role 구분해 `requireSuperAdmin()` 헬퍼 추가.

기존 모든 action은 `session.adminId`만 사용하므로 `role` 필드 추가는 하위 호환.

- [ ] **Step 1: `lib/auth/admin-session.ts` 전체 교체**

```ts
import { auth } from '@/auth';
import { redirect } from 'next/navigation';

export type AdminRole = 'operator' | 'super_admin';

export type AdminSession = {
  adminId: string;
  role: AdminRole;
};

function getAllowedEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

function getSuperAdminEmails(): string[] {
  return (process.env.ADMIN_SUPER_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export async function requireAdminSession(): Promise<AdminSession> {
  const session = await auth();
  if (!session?.user?.email) redirect('/login');

  const email = session.user.email.toLowerCase();
  if (!getAllowedEmails().includes(email)) redirect('/login');

  const role: AdminRole = getSuperAdminEmails().includes(email) ? 'super_admin' : 'operator';
  return { adminId: email, role };
}

export async function requireSuperAdmin(): Promise<AdminSession> {
  const session = await requireAdminSession();
  if (session.role !== 'super_admin') redirect('/');
  return session;
}
```

- [ ] **Step 2: typecheck 통과 확인**

```bash
pnpm typecheck
```

Expected: 에러 없음

- [ ] **Step 3: 즉시 무효화 수동 검증**

로그인 후 `.env.local`의 `ADMIN_EMAILS`에서 자신의 이메일 제거 후 dev 서버 재시작:

```bash
# .env.local에서 이메일 하나 제거 후
pnpm dev
```

해당 계정의 기존 세션으로 페이지 접근 → `/login` 리디렉션 확인. 테스트 후 이메일 복원.

- [ ] **Step 4: Commit**

```bash
git add lib/auth/admin-session.ts
git commit -m "feat: requireAdminSession validates against ADMIN_EMAILS env on every request"
```

---

## Task 3: Next.js middleware 추가

**Files:**
- Create: `middleware.ts` (프로젝트 루트 — `package.json`과 같은 레벨)

JWT 자체가 없는 요청(미로그인)을 edge에서 즉시 차단. allowlist 체크는 하지 않음 — 그것은 `requireAdminSession()`의 역할. `/login`, `/api/auth/*`, Next.js 내부 경로는 matcher에서 제외.

- [ ] **Step 1: `middleware.ts` 생성**

```ts
import { auth } from '@/auth';

export default auth((req) => {
  if (!req.auth) {
    return Response.redirect(new URL('/login', req.url));
  }
});

export const config = {
  matcher: [
    '/((?!login|api/auth|_next/static|_next/image|favicon\\.ico).*)',
  ],
};
```

- [ ] **Step 2: typecheck 통과 확인**

```bash
pnpm typecheck
```

Expected: 에러 없음

- [ ] **Step 3: 수동 검증**

브라우저에서 로그아웃 후 쿠키를 모두 지운 상태로 `/buyers` 직접 접근 → `/login` 리디렉션 확인.  
로그인 후 동일 경로 접근 → 정상 로드 확인.

- [ ] **Step 4: Commit**

```bash
git add middleware.ts
git commit -m "feat: add Next.js middleware for edge-level session guard"
```

---

## Self-Review

### 위험요소 커버리지

| 위험요소 | 해결 방법 | 태스크 |
|---------|---------|--------|
| [High] 이메일 하드코딩 | `ADMIN_EMAILS` env var — git에 노출 없음 | Task 1 |
| [Medium] 미들웨어 없음 | `middleware.ts` edge 체크 | Task 3 |
| [Medium] 권한 단계 없음 | `ADMIN_SUPER_EMAILS` + `requireSuperAdmin()` | Task 2 |
| [Low] 세션 무효화 | env 수정 + 재배포 후 즉시 차단 | Task 2 |

### 잔여 제약

- 세션 무효화는 재배포 필요 (DB 방식 대비). 4명 내부 툴에서는 허용 가능한 트레이드오프.
- `ADMIN_SUPER_EMAILS`가 `ADMIN_EMAILS`의 부분집합이어야 함 — 환경변수 설정 시 주의.
