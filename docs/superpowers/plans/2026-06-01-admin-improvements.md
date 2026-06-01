# Admin 관리 기능 개선 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin 패널에 회원관리 페이지를 신규 추가하고, 기존 목록 화면 전반에 검색·필터를 추가하며, 구매사·판매사 상세 페이지에 멤버 섹션을 추가한다.

**Architecture:** Next.js 15 App Router 서버 컴포넌트 패턴을 그대로 따른다. 검색/필터는 URL search params 기반 서버사이드 처리. 서버 액션은 기존 `suspendWorkspaceAction` 패턴(requireAdminSession + transaction + auditLog + revalidatePath)을 재사용. DB 마이그레이션 없음.

**Tech Stack:** Next.js 15 (App Router), Drizzle ORM v0.45, PostgreSQL, TypeScript, Tailwind CSS

---

## File Map

| 파일 | 유형 |
|---|---|
| `lib/server/queries/admin/users.ts` | 신규 |
| `lib/server/queries/admin/workspaceMembers.ts` | 신규 |
| `lib/server/actions/admin/suspendUserAction.ts` | 신규 |
| `lib/server/actions/admin/unsuspendUserAction.ts` | 신규 |
| `lib/server/actions/admin/removeWorkspaceMemberAction.ts` | 신규 |
| `app/(protected)/users/page.tsx` | 신규 |
| `app/(protected)/users/[id]/page.tsx` | 신규 |
| `components/AdminShell.tsx` | 수정 (NAV 항목 추가) |
| `lib/server/queries/admin/buyers.ts` | 수정 (필터 파라미터) |
| `lib/server/queries/admin/sellers.ts` | 수정 (필터 파라미터) |
| `lib/server/queries/admin/rfps.ts` | 수정 (필터 파라미터) |
| `lib/server/queries/admin/review.ts` | 수정 (listApplications 리네임 + 필터) |
| `app/(protected)/buyers/page.tsx` | 수정 (검색 UI) |
| `app/(protected)/sellers/page.tsx` | 수정 (검색 UI) |
| `app/(protected)/rfps/page.tsx` | 수정 (검색 UI) |
| `app/(protected)/review/page.tsx` | 수정 (검색 UI) |
| `app/(protected)/buyers/[id]/page.tsx` | 수정 (멤버 섹션) |
| `app/(protected)/sellers/[id]/page.tsx` | 수정 (멤버 섹션) |

---

## Task 1: 유저 쿼리 파일 생성

**Files:**
- Create: `lib/server/queries/admin/users.ts`
- Create: `lib/server/queries/admin/workspaceMembers.ts`

- [ ] **Step 1: `lib/server/queries/admin/users.ts` 생성**

```typescript
import { and, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import { users, workspaceMembers, workspaces } from '@/lib/db/schema';
import { actionDb } from '@/lib/server/actions/auth/_shared';

export type UserRow = {
  id: string;
  name: string;
  email: string;
  status: string;
  workspaceCount: number;
  createdAt: Date;
};

export type UserMembershipRow = {
  workspaceId: string;
  workspaceName: string;
  workspaceType: 'buyer' | 'pg';
  role: 'admin' | 'member';
  joinedAt: Date;
  isLastAdmin: boolean;
};

export type UserDetailResult = {
  user: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    status: string;
    createdAt: Date;
  };
  memberships: UserMembershipRow[];
};

export async function listUsers(
  opts: { q?: string; status?: string } = {},
): Promise<UserRow[]> {
  const { q, status } = opts;
  const rows = await actionDb()
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      status: users.status,
      workspaceCount: sql<number>`cast(count(${workspaceMembers.userId}) as int)`,
      createdAt: users.createdAt,
    })
    .from(users)
    .leftJoin(workspaceMembers, eq(workspaceMembers.userId, users.id))
    .where(
      and(
        q ? or(ilike(users.name, `%${q}%`), ilike(users.email, `%${q}%`)) : undefined,
        status && status !== 'all' ? eq(users.status, status) : undefined,
      ),
    )
    .groupBy(users.id, users.name, users.email, users.status, users.createdAt)
    .orderBy(desc(users.createdAt));
  return rows as UserRow[];
}

export async function getUserDetail(userId: string): Promise<UserDetailResult | null> {
  const db = actionDb();

  const [user] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      phone: users.phone,
      status: users.status,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, userId));

  if (!user) return null;

  const memberships = await db
    .select({
      workspaceId: workspaces.id,
      workspaceName: workspaces.name,
      workspaceType: workspaces.type,
      role: workspaceMembers.role,
      joinedAt: workspaceMembers.joinedAt,
    })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaceMembers.workspaceId, workspaces.id))
    .where(eq(workspaceMembers.userId, userId))
    .orderBy(workspaceMembers.role, workspaceMembers.joinedAt);

  const adminMemberships = memberships.filter((m) => m.role === 'admin');
  const lastAdminWorkspaceIds = new Set<string>();

  if (adminMemberships.length > 0) {
    const adminCountRows = await db
      .select({
        workspaceId: workspaceMembers.workspaceId,
        adminCount: sql<number>`cast(count(*) as int)`,
      })
      .from(workspaceMembers)
      .where(
        and(
          inArray(
            workspaceMembers.workspaceId,
            adminMemberships.map((m) => m.workspaceId),
          ),
          eq(workspaceMembers.role, 'admin'),
        ),
      )
      .groupBy(workspaceMembers.workspaceId);

    for (const row of adminCountRows) {
      if (row.adminCount === 1) lastAdminWorkspaceIds.add(row.workspaceId);
    }
  }

  return {
    user,
    memberships: memberships.map((m) => ({
      ...m,
      workspaceType: m.workspaceType as 'buyer' | 'pg',
      role: m.role as 'admin' | 'member',
      isLastAdmin: lastAdminWorkspaceIds.has(m.workspaceId),
    })),
  };
}
```

- [ ] **Step 2: `lib/server/queries/admin/workspaceMembers.ts` 생성**

```typescript
import { eq } from 'drizzle-orm';
import { workspaceMembers, users } from '@/lib/db/schema';
import { actionDb } from '@/lib/server/actions/auth/_shared';

export type WorkspaceMemberRow = {
  userId: string;
  name: string;
  email: string;
  role: 'admin' | 'member';
  joinedAt: Date;
  isLastAdmin: boolean;
};

export async function getWorkspaceMembers(workspaceId: string): Promise<WorkspaceMemberRow[]> {
  const rows = await actionDb()
    .select({
      userId: users.id,
      name: users.name,
      email: users.email,
      role: workspaceMembers.role,
      joinedAt: workspaceMembers.joinedAt,
    })
    .from(workspaceMembers)
    .innerJoin(users, eq(workspaceMembers.userId, users.id))
    .where(eq(workspaceMembers.workspaceId, workspaceId))
    .orderBy(workspaceMembers.role, workspaceMembers.joinedAt);

  const adminCount = rows.filter((r) => r.role === 'admin').length;
  return rows.map((r) => ({
    ...r,
    role: r.role as 'admin' | 'member',
    isLastAdmin: r.role === 'admin' && adminCount === 1,
  }));
}
```

- [ ] **Step 3: 타입 검사**

```bash
pnpm typecheck
```

Expected: 에러 없음

- [ ] **Step 4: 커밋**

```bash
git add lib/server/queries/admin/users.ts lib/server/queries/admin/workspaceMembers.ts
git commit -m "feat: add user and workspace member queries"
```

---

## Task 2: 유저 서버 액션 3개 생성

**Files:**
- Create: `lib/server/actions/admin/suspendUserAction.ts`
- Create: `lib/server/actions/admin/unsuspendUserAction.ts`
- Create: `lib/server/actions/admin/removeWorkspaceMemberAction.ts`

- [ ] **Step 1: `lib/server/actions/admin/suspendUserAction.ts` 생성**

```typescript
'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { users, adminAuditLogs } from '@/lib/db/schema';
import { requireAdminSession } from '@/lib/auth/admin-session';
import { actionDb } from '@/lib/server/actions/auth/_shared';

type Result = { ok: true } | { ok: false; error: string };

export async function suspendUserAction(userId: string): Promise<Result> {
  const session = await requireAdminSession();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await actionDb().transaction(async (tx: any) => {
    await tx.update(users).set({ status: 'suspended' }).where(eq(users.id, userId));
    await tx.insert(adminAuditLogs).values({
      actor: session.adminId,
      action: 'user.suspend',
      entityType: 'user',
      entityId: userId,
      payloadJson: { after: { status: 'suspended' } },
    });
  });

  revalidatePath(`/users/${userId}`);
  revalidatePath('/users');
  return { ok: true };
}
```

- [ ] **Step 2: `lib/server/actions/admin/unsuspendUserAction.ts` 생성**

```typescript
'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { users, adminAuditLogs } from '@/lib/db/schema';
import { requireAdminSession } from '@/lib/auth/admin-session';
import { actionDb } from '@/lib/server/actions/auth/_shared';

type Result = { ok: true } | { ok: false; error: string };

export async function unsuspendUserAction(userId: string): Promise<Result> {
  const session = await requireAdminSession();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await actionDb().transaction(async (tx: any) => {
    await tx.update(users).set({ status: 'active' }).where(eq(users.id, userId));
    await tx.insert(adminAuditLogs).values({
      actor: session.adminId,
      action: 'user.unsuspend',
      entityType: 'user',
      entityId: userId,
      payloadJson: { after: { status: 'active' } },
    });
  });

  revalidatePath(`/users/${userId}`);
  revalidatePath('/users');
  return { ok: true };
}
```

- [ ] **Step 3: `lib/server/actions/admin/removeWorkspaceMemberAction.ts` 생성**

```typescript
'use server';

import { and, eq, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { workspaceMembers, adminAuditLogs } from '@/lib/db/schema';
import { requireAdminSession } from '@/lib/auth/admin-session';
import { actionDb } from '@/lib/server/actions/auth/_shared';

type Result = { ok: true } | { ok: false; error: string };

export async function removeWorkspaceMemberAction(
  workspaceId: string,
  userId: string,
): Promise<Result> {
  const session = await requireAdminSession();
  const db = actionDb();

  const [memberRow] = await db
    .select({ role: workspaceMembers.role })
    .from(workspaceMembers)
    .where(
      and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)),
    );

  if (!memberRow) return { ok: false, error: 'MEMBER_NOT_FOUND' };

  if (memberRow.role === 'admin') {
    const [result] = await db
      .select({ adminCount: sql<number>`cast(count(*) as int)` })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, workspaceId),
          eq(workspaceMembers.role, 'admin'),
        ),
      );
    if ((result?.adminCount ?? 0) <= 1) return { ok: false, error: 'LAST_ADMIN' };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await db.transaction(async (tx: any) => {
    await tx
      .delete(workspaceMembers)
      .where(
        and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)),
      );
    await tx.insert(adminAuditLogs).values({
      actor: session.adminId,
      action: 'workspace.member.remove',
      entityType: 'workspace',
      entityId: workspaceId,
      payloadJson: { userId },
    });
  });

  revalidatePath(`/buyers/${workspaceId}`);
  revalidatePath(`/sellers/${workspaceId}`);
  revalidatePath(`/users/${userId}`);
  return { ok: true };
}
```

- [ ] **Step 4: 타입 검사**

```bash
pnpm typecheck
```

Expected: 에러 없음

- [ ] **Step 5: 커밋**

```bash
git add lib/server/actions/admin/suspendUserAction.ts lib/server/actions/admin/unsuspendUserAction.ts lib/server/actions/admin/removeWorkspaceMemberAction.ts
git commit -m "feat: add user suspend/unsuspend and remove workspace member actions"
```

---

## Task 3: AdminShell 네비게이션 업데이트 + /users 목록 페이지 생성

**Files:**
- Modify: `components/AdminShell.tsx`
- Create: `app/(protected)/users/page.tsx`

- [ ] **Step 1: `components/AdminShell.tsx` — NAV에 회원 항목 추가**

`/review` 항목 다음 줄에 회원 항목을 삽입한다.

현재:
```typescript
const NAV = [
  { href: '/', label: '대시보드' },
  { href: '/review', label: '입점 심사' },
  { href: '/buyers', label: '구매사' },
  { href: '/sellers', label: '판매사' },
  { href: '/rfps', label: 'RFP' },
  { href: '/audit-log', label: '감사 로그' },
] as const;
```

변경 후:
```typescript
const NAV = [
  { href: '/', label: '대시보드' },
  { href: '/review', label: '입점 심사' },
  { href: '/users', label: '회원' },
  { href: '/buyers', label: '구매사' },
  { href: '/sellers', label: '판매사' },
  { href: '/rfps', label: 'RFP' },
  { href: '/audit-log', label: '감사 로그' },
] as const;
```

- [ ] **Step 2: `app/(protected)/users/page.tsx` 생성**

```tsx
import { listUsers } from '@/lib/server/queries/admin/users';
import Link from 'next/link';
import { AdminStatusBadge } from '@/components/AdminStatusBadge';

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const { q, status } = await searchParams;
  const userList = await listUsers({ q, status });

  return (
    <div className="space-y-4">
      <h1 className="text-headline-small font-semibold">회원</h1>
      <form method="GET" className="flex gap-2">
        <input
          name="q"
          defaultValue={q ?? ''}
          placeholder="이름 또는 이메일 검색"
          className="rounded border border-outline-variant px-3 py-1.5 text-body-small bg-surface focus:outline-none focus:ring-1 focus:ring-primary w-64"
        />
        <select
          name="status"
          defaultValue={status ?? ''}
          className="rounded border border-outline-variant px-3 py-1.5 text-body-small bg-surface"
        >
          <option value="">전체</option>
          <option value="active">활성</option>
          <option value="suspended">정지</option>
        </select>
        <button
          type="submit"
          className="rounded bg-primary text-on-primary px-3 py-1.5 text-label-small"
        >
          검색
        </button>
      </form>
      <div className="rounded border border-outline-variant overflow-hidden">
        <table className="w-full text-body-small">
          <thead>
            <tr className="border-b border-outline-variant bg-surface-container-low">
              <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium">이름</th>
              <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium">이메일</th>
              <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium">상태</th>
              <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium">소속 워크스페이스</th>
              <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium">가입일</th>
            </tr>
          </thead>
          <tbody>
            {userList.map((u) => (
              <tr
                key={u.id}
                className="border-b border-outline-variant last:border-0 hover:bg-surface-container-low"
              >
                <td className="px-4 py-3">
                  <Link href={`/users/${u.id}`} className="text-primary hover:underline">
                    {u.name}
                  </Link>
                </td>
                <td className="px-4 py-3 text-on-surface-variant">{u.email}</td>
                <td className="px-4 py-3">
                  <AdminStatusBadge status={u.status} />
                </td>
                <td className="px-4 py-3 md-numeric text-label-small text-on-surface-variant">
                  {u.workspaceCount}개
                </td>
                <td className="px-4 py-3 md-numeric text-label-small text-on-surface-variant">
                  {new Date(u.createdAt).toLocaleDateString('ko-KR')}
                </td>
              </tr>
            ))}
            {userList.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-on-surface-variant">
                  유저가 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: 타입 검사**

```bash
pnpm typecheck
```

Expected: 에러 없음

- [ ] **Step 4: 브라우저 확인**

```bash
pnpm dev
```

`http://localhost:3001/users` 접속 후:
- 사이드바에 "회원" 항목이 표시되는지 확인
- 유저 목록 테이블이 렌더링되는지 확인
- `?q=test` URL 파라미터로 검색 결과 필터링이 동작하는지 확인

- [ ] **Step 5: 커밋**

```bash
git add components/AdminShell.tsx "app/(protected)/users/page.tsx"
git commit -m "feat: add users list page with search and status filter"
```

---

## Task 4: /users/[id] 유저 상세 페이지 생성

**Files:**
- Create: `app/(protected)/users/[id]/page.tsx`

- [ ] **Step 1: `app/(protected)/users/[id]/page.tsx` 생성**

```tsx
import { notFound } from 'next/navigation';
import { getUserDetail } from '@/lib/server/queries/admin/users';
import { AdminStatusBadge } from '@/components/AdminStatusBadge';
import { suspendUserAction } from '@/lib/server/actions/admin/suspendUserAction';
import { unsuspendUserAction } from '@/lib/server/actions/admin/unsuspendUserAction';
import { removeWorkspaceMemberAction } from '@/lib/server/actions/admin/removeWorkspaceMemberAction';

export default async function UserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detail = await getUserDetail(id);
  if (!detail) notFound();

  const { user, memberships } = detail;
  const isSuspended = user.status === 'suspended';

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <h1 className="text-headline-small font-semibold">{user.name}</h1>
        <AdminStatusBadge status={user.status} />
      </div>

      <section className="rounded border border-outline-variant divide-y divide-outline-variant">
        <div className="px-4 py-3 flex gap-4">
          <span className="text-label-small text-on-surface-variant w-32 shrink-0">이메일</span>
          <span className="text-body-small">{user.email}</span>
        </div>
        {user.phone && (
          <div className="px-4 py-3 flex gap-4">
            <span className="text-label-small text-on-surface-variant w-32 shrink-0">전화번호</span>
            <span className="text-body-small md-numeric">{user.phone}</span>
          </div>
        )}
        <div className="px-4 py-3 flex gap-4">
          <span className="text-label-small text-on-surface-variant w-32 shrink-0">가입일</span>
          <span className="text-body-small md-numeric">
            {new Date(user.createdAt).toLocaleDateString('ko-KR')}
          </span>
        </div>
      </section>

      <section>
        <h2 className="text-title-small font-semibold mb-3">계정 상태</h2>
        {isSuspended ? (
          <form action={unsuspendUserAction.bind(null, user.id)}>
            <button
              type="submit"
              className="rounded border border-primary text-primary px-4 py-2 text-label-small hover:bg-primary/10"
            >
              계정 활성화
            </button>
          </form>
        ) : (
          <form action={suspendUserAction.bind(null, user.id)}>
            <button
              type="submit"
              className="rounded border border-error text-error px-4 py-2 text-label-small hover:bg-error/10"
            >
              계정 정지
            </button>
          </form>
        )}
      </section>

      <section>
        <h2 className="text-title-small font-semibold mb-3">
          소속 워크스페이스 ({memberships.length})
        </h2>
        <div className="rounded border border-outline-variant overflow-hidden">
          <table className="w-full text-body-small">
            <thead>
              <tr className="border-b border-outline-variant bg-surface-container-low">
                <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium">워크스페이스</th>
                <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium">유형</th>
                <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium">역할</th>
                <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium">가입일</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {memberships.map((m) => (
                <tr
                  key={m.workspaceId}
                  className="border-b border-outline-variant last:border-0"
                >
                  <td className="px-4 py-3">{m.workspaceName}</td>
                  <td className="px-4 py-3 text-label-small text-on-surface-variant">
                    {m.workspaceType === 'buyer' ? '구매사' : 'PG사'}
                  </td>
                  <td className="px-4 py-3 text-label-small">
                    {m.role === 'admin' ? '관리자' : '멤버'}
                  </td>
                  <td className="px-4 py-3 md-numeric text-label-small text-on-surface-variant">
                    {new Date(m.joinedAt).toLocaleDateString('ko-KR')}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <form
                      action={removeWorkspaceMemberAction.bind(null, m.workspaceId, user.id)}
                    >
                      <button
                        type="submit"
                        disabled={m.isLastAdmin}
                        className="text-label-small text-error hover:underline disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        제외
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
              {memberships.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-on-surface-variant">
                    소속 워크스페이스 없음
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 2: 타입 검사**

```bash
pnpm typecheck
```

Expected: 에러 없음

- [ ] **Step 3: 브라우저 확인**

`http://localhost:3001/users` 에서 유저 클릭 → 상세 페이지 이동 확인:
- 유저 정보 카드 표시 확인
- 계정 정지/활성화 버튼 표시 확인 (상태에 따라 토글)
- 소속 워크스페이스 테이블 표시 확인
- 마지막 admin의 [제외] 버튼이 비활성화되는지 확인

- [ ] **Step 4: 커밋**

```bash
git add "app/(protected)/users/[id]/page.tsx"
git commit -m "feat: add user detail page with status actions and workspace memberships"
```

---

## Task 5: 구매사 · 판매사 목록 검색/필터

**Files:**
- Modify: `lib/server/queries/admin/buyers.ts`
- Modify: `lib/server/queries/admin/sellers.ts`
- Modify: `app/(protected)/buyers/page.tsx`
- Modify: `app/(protected)/sellers/page.tsx`

- [ ] **Step 1: `lib/server/queries/admin/buyers.ts` — `listBuyers`에 필터 파라미터 추가**

`listBuyers` 함수 시그니처 및 구현을 다음으로 교체한다. `import` 라인에 `and`, `ilike` 추가.

```typescript
import { and, desc, eq, ilike } from 'drizzle-orm';
import { workspaces, rfps } from '@/lib/db/schema';
import { actionDb } from '@/lib/server/actions/auth/_shared';

export type BuyerRow = {
  id: string;
  name: string;
  status: 'pending' | 'active' | 'suspended';
  createdAt: Date;
};

export type RfpRow = {
  id: string;
  code: string;
  title: string;
  status: 'draft' | 'sent' | 'closed' | 'cancelled' | 'awarded';
  deadline: Date;
  createdAt: Date;
};

export type WorkspaceFullRow = typeof workspaces.$inferSelect;

export async function listBuyers(
  opts: { q?: string; status?: string } = {},
): Promise<BuyerRow[]> {
  const { q, status } = opts;
  const rows = await actionDb()
    .select({
      id: workspaces.id,
      name: workspaces.name,
      status: workspaces.status,
      createdAt: workspaces.createdAt,
    })
    .from(workspaces)
    .where(
      and(
        eq(workspaces.type, 'buyer'),
        q ? ilike(workspaces.name, `%${q}%`) : undefined,
        status && status !== 'all'
          ? eq(workspaces.status, status as 'pending' | 'active' | 'suspended')
          : undefined,
      ),
    )
    .orderBy(desc(workspaces.createdAt));
  return rows as BuyerRow[];
}

export async function getBuyerDetail(workspaceId: string) {
  const [ws] = (await actionDb()
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId)) as Promise<WorkspaceFullRow[]>);
  if (!ws) return null;

  const buyerRfps = await actionDb()
    .select({
      id: rfps.id,
      code: rfps.code,
      title: rfps.title,
      status: rfps.status,
      deadline: rfps.deadline,
      createdAt: rfps.createdAt,
    })
    .from(rfps)
    .where(eq(rfps.buyerWsId, workspaceId))
    .orderBy(desc(rfps.createdAt)) as Promise<RfpRow[]>;

  return { workspace: ws, rfps: buyerRfps };
}
```

- [ ] **Step 2: `lib/server/queries/admin/sellers.ts` — `listSellers`에 필터 파라미터 추가**

`listSellers` 함수를 다음으로 교체한다. `import` 라인에 `and`, `ilike` 추가.

```typescript
import { and, desc, eq, ilike } from 'drizzle-orm';
import { workspaces, bids, pgProfiles } from '@/lib/db/schema';
import { actionDb } from '@/lib/server/actions/auth/_shared';
import { getWorkspaceAdminUser } from './workspaceOwner';

export type SellerRow = {
  id: string;
  name: string;
  status: 'pending' | 'active' | 'suspended';
  createdAt: Date;
};

export type BidRow = {
  id: string;
  rfpId: string;
  status: 'draft' | 'submitted' | 'withdrawn';
  submittedAt: Date;
};

export type WorkspaceFullRow = typeof workspaces.$inferSelect;
export type PgProfileRow = typeof pgProfiles.$inferSelect;

export async function listSellers(
  opts: { q?: string; status?: string } = {},
): Promise<SellerRow[]> {
  const { q, status } = opts;
  const rows = await actionDb()
    .select({
      id: workspaces.id,
      name: workspaces.name,
      status: workspaces.status,
      createdAt: workspaces.createdAt,
    })
    .from(workspaces)
    .where(
      and(
        eq(workspaces.type, 'pg'),
        q ? ilike(workspaces.name, `%${q}%`) : undefined,
        status && status !== 'all'
          ? eq(workspaces.status, status as 'pending' | 'active' | 'suspended')
          : undefined,
      ),
    )
    .orderBy(desc(workspaces.createdAt));
  return rows as SellerRow[];
}

export async function getSellerDetail(workspaceId: string) {
  const [ws] = (await actionDb()
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId)) as Promise<WorkspaceFullRow[]>);
  if (!ws) return null;

  const [profile] = (await actionDb()
    .select()
    .from(pgProfiles)
    .where(eq(pgProfiles.workspaceId, workspaceId)) as Promise<PgProfileRow[]>);

  const sellerBids = await actionDb()
    .select({
      id: bids.id,
      rfpId: bids.rfpId,
      status: bids.status,
      submittedAt: bids.submittedAt,
    })
    .from(bids)
    .where(eq(bids.pgWsId, workspaceId))
    .orderBy(desc(bids.submittedAt))
    .limit(20) as Promise<BidRow[]>;

  const ownerContact = await getWorkspaceAdminUser(workspaceId);

  return { workspace: ws, pgProfile: profile ?? null, bids: sellerBids, ownerContact };
}
```

- [ ] **Step 3: `app/(protected)/buyers/page.tsx` — 검색 UI + searchParams 수신**

파일 전체를 다음으로 교체한다. 기존의 `/admin/buyers/${b.id}` 링크 버그도 함께 수정한다.

```tsx
import { listBuyers } from '@/lib/server/queries/admin/buyers';
import Link from 'next/link';
import { AdminStatusBadge } from '@/components/AdminStatusBadge';

export default async function BuyersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const { q, status } = await searchParams;
  const buyers = await listBuyers({ q, status });

  return (
    <div className="space-y-4">
      <h1 className="text-headline-small font-semibold">구매사</h1>
      <form method="GET" className="flex gap-2">
        <input
          name="q"
          defaultValue={q ?? ''}
          placeholder="회사명 검색"
          className="rounded border border-outline-variant px-3 py-1.5 text-body-small bg-surface focus:outline-none focus:ring-1 focus:ring-primary w-64"
        />
        <select
          name="status"
          defaultValue={status ?? ''}
          className="rounded border border-outline-variant px-3 py-1.5 text-body-small bg-surface"
        >
          <option value="">전체</option>
          <option value="pending">대기</option>
          <option value="active">활성</option>
          <option value="suspended">정지</option>
        </select>
        <button
          type="submit"
          className="rounded bg-primary text-on-primary px-3 py-1.5 text-label-small"
        >
          검색
        </button>
      </form>
      <div className="rounded border border-outline-variant overflow-hidden">
        <table className="w-full text-body-small">
          <thead>
            <tr className="border-b border-outline-variant bg-surface-container-low">
              <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium">회사명</th>
              <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium">상태</th>
              <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium">가입일</th>
            </tr>
          </thead>
          <tbody>
            {buyers.map((b) => (
              <tr
                key={b.id}
                className="border-b border-outline-variant last:border-0 hover:bg-surface-container-low"
              >
                <td className="px-4 py-3">
                  <Link href={`/buyers/${b.id}`} className="text-primary hover:underline">
                    {b.name}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <AdminStatusBadge status={b.status} />
                </td>
                <td className="px-4 py-3 md-numeric text-label-small text-on-surface-variant">
                  {new Date(b.createdAt).toLocaleDateString('ko-KR')}
                </td>
              </tr>
            ))}
            {buyers.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-on-surface-variant">
                  등록된 구매사가 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: `app/(protected)/sellers/page.tsx` — 검색 UI + searchParams 수신**

파일 전체를 다음으로 교체한다. 기존의 `/admin/sellers/${s.id}` 링크 버그도 함께 수정한다.

```tsx
import { listSellers } from '@/lib/server/queries/admin/sellers';
import Link from 'next/link';
import { AdminStatusBadge } from '@/components/AdminStatusBadge';

export default async function SellersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const { q, status } = await searchParams;
  const sellers = await listSellers({ q, status });

  return (
    <div className="space-y-4">
      <h1 className="text-headline-small font-semibold">판매사</h1>
      <form method="GET" className="flex gap-2">
        <input
          name="q"
          defaultValue={q ?? ''}
          placeholder="회사명 검색"
          className="rounded border border-outline-variant px-3 py-1.5 text-body-small bg-surface focus:outline-none focus:ring-1 focus:ring-primary w-64"
        />
        <select
          name="status"
          defaultValue={status ?? ''}
          className="rounded border border-outline-variant px-3 py-1.5 text-body-small bg-surface"
        >
          <option value="">전체</option>
          <option value="pending">대기</option>
          <option value="active">활성</option>
          <option value="suspended">정지</option>
        </select>
        <button
          type="submit"
          className="rounded bg-primary text-on-primary px-3 py-1.5 text-label-small"
        >
          검색
        </button>
      </form>
      <div className="rounded border border-outline-variant overflow-hidden">
        <table className="w-full text-body-small">
          <thead>
            <tr className="border-b border-outline-variant bg-surface-container-low">
              <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium">회사명</th>
              <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium">상태</th>
              <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium">가입일</th>
            </tr>
          </thead>
          <tbody>
            {sellers.map((s) => (
              <tr
                key={s.id}
                className="border-b border-outline-variant last:border-0 hover:bg-surface-container-low"
              >
                <td className="px-4 py-3">
                  <Link href={`/sellers/${s.id}`} className="text-primary hover:underline">
                    {s.name}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <AdminStatusBadge status={s.status} />
                </td>
                <td className="px-4 py-3 md-numeric text-label-small text-on-surface-variant">
                  {new Date(s.createdAt).toLocaleDateString('ko-KR')}
                </td>
              </tr>
            ))}
            {sellers.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-on-surface-variant">
                  등록된 판매사가 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: 타입 검사**

```bash
pnpm typecheck
```

Expected: 에러 없음

- [ ] **Step 6: 브라우저 확인**

`http://localhost:3001/buyers` 접속 후:
- 검색창 + 상태 드롭다운 표시 확인
- 검색어 입력 후 제출 → URL에 `?q=` 파라미터 반영, 필터링된 결과 표시 확인
- `/sellers` 에서도 동일하게 확인

- [ ] **Step 7: 커밋**

```bash
git add lib/server/queries/admin/buyers.ts lib/server/queries/admin/sellers.ts "app/(protected)/buyers/page.tsx" "app/(protected)/sellers/page.tsx"
git commit -m "feat: add search and status filter to buyers and sellers list pages"
```

---

## Task 6: RFP 목록 검색/필터

**Files:**
- Modify: `lib/server/queries/admin/rfps.ts`
- Modify: `app/(protected)/rfps/page.tsx`

- [ ] **Step 1: `lib/server/queries/admin/rfps.ts` — `listAllRfps`에 필터 파라미터 추가**

`import` 라인에 `and`, `ilike`, `or` 추가. `listAllRfps` 함수를 다음으로 교체한다.

```typescript
import { and, desc, eq, ilike, or } from 'drizzle-orm';
import { rfps, workspaces, bids } from '@/lib/db/schema';
import { actionDb } from '@/lib/server/actions/auth/_shared';

export type RfpListRow = {
  id: string;
  code: string;
  title: string;
  status: 'draft' | 'sent' | 'closed' | 'cancelled' | 'awarded';
  deadline: Date;
  buyerName: string;
  buyerWsId: string;
};

export type BidDetailRow = {
  id: string;
  pgWsId: string;
  pgWsName: string;
  status: 'draft' | 'submitted' | 'withdrawn';
  submittedAt: Date;
};

export async function listAllRfps(
  opts: { q?: string; status?: string } = {},
): Promise<RfpListRow[]> {
  const { q, status } = opts;
  return actionDb()
    .select({
      id: rfps.id,
      code: rfps.code,
      title: rfps.title,
      status: rfps.status,
      deadline: rfps.deadline,
      buyerName: workspaces.name,
      buyerWsId: rfps.buyerWsId,
    })
    .from(rfps)
    .innerJoin(workspaces, eq(rfps.buyerWsId, workspaces.id))
    .where(
      and(
        q ? or(ilike(rfps.title, `%${q}%`), ilike(rfps.code, `%${q}%`)) : undefined,
        status && status !== 'all'
          ? eq(rfps.status, status as 'draft' | 'sent' | 'closed' | 'cancelled' | 'awarded')
          : undefined,
      ),
    )
    .orderBy(desc(rfps.createdAt)) as Promise<RfpListRow[]>;
}

export async function getRfpDetail(rfpId: string) {
  const [rfp] = await actionDb()
    .select()
    .from(rfps)
    .where(eq(rfps.id, rfpId));
  if (!rfp) return null;

  const rfpBids: BidDetailRow[] = await actionDb()
    .select({
      id: bids.id,
      pgWsId: bids.pgWsId,
      pgWsName: workspaces.name,
      status: bids.status,
      submittedAt: bids.submittedAt,
    })
    .from(bids)
    .innerJoin(workspaces, eq(bids.pgWsId, workspaces.id))
    .where(eq(bids.rfpId, rfpId));

  return { rfp, bids: rfpBids };
}
```

- [ ] **Step 2: `app/(protected)/rfps/page.tsx` — 검색 UI + searchParams 수신**

파일 전체를 다음으로 교체한다.

```tsx
import { listAllRfps } from '@/lib/server/queries/admin/rfps';
import Link from 'next/link';
import { AdminStatusBadge } from '@/components/AdminStatusBadge';

export default async function RfpsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const { q, status } = await searchParams;
  const rfpList = await listAllRfps({ q, status });

  return (
    <div className="space-y-4">
      <h1 className="text-headline-small font-semibold">RFP 전체 목록</h1>
      <form method="GET" className="flex gap-2">
        <input
          name="q"
          defaultValue={q ?? ''}
          placeholder="제목 또는 코드 검색"
          className="rounded border border-outline-variant px-3 py-1.5 text-body-small bg-surface focus:outline-none focus:ring-1 focus:ring-primary w-64"
        />
        <select
          name="status"
          defaultValue={status ?? ''}
          className="rounded border border-outline-variant px-3 py-1.5 text-body-small bg-surface"
        >
          <option value="">전체</option>
          <option value="draft">초안</option>
          <option value="sent">발송</option>
          <option value="closed">마감</option>
          <option value="cancelled">취소</option>
          <option value="awarded">낙찰</option>
        </select>
        <button
          type="submit"
          className="rounded bg-primary text-on-primary px-3 py-1.5 text-label-small"
        >
          검색
        </button>
      </form>
      <div className="rounded border border-outline-variant overflow-hidden">
        <table className="w-full text-body-small">
          <thead>
            <tr className="border-b border-outline-variant bg-surface-container-low">
              <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium">코드</th>
              <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium">제목</th>
              <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium">구매사</th>
              <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium">상태</th>
              <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium">마감</th>
            </tr>
          </thead>
          <tbody>
            {rfpList.map((rfp) => (
              <tr
                key={rfp.id}
                className="border-b border-outline-variant last:border-0 hover:bg-surface-container-low"
              >
                <td className="px-4 py-3 md-numeric text-label-small text-on-surface-variant">
                  {rfp.code}
                </td>
                <td className="px-4 py-3">
                  <Link href={`/rfps/${rfp.id}`} className="text-primary hover:underline">
                    {rfp.title}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <Link href={`/buyers/${rfp.buyerWsId}`} className="text-on-surface hover:underline">
                    {rfp.buyerName}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <AdminStatusBadge status={rfp.status} />
                </td>
                <td className="px-4 py-3 md-numeric text-label-small text-on-surface-variant">
                  {new Date(rfp.deadline).toLocaleDateString('ko-KR')}
                </td>
              </tr>
            ))}
            {rfpList.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-on-surface-variant">
                  등록된 RFP가 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: 타입 검사**

```bash
pnpm typecheck
```

Expected: 에러 없음

- [ ] **Step 4: 브라우저 확인**

`http://localhost:3001/rfps` 접속 후:
- 검색창 + 상태 드롭다운 표시 확인
- 코드 또는 제목으로 검색 동작 확인

- [ ] **Step 5: 커밋**

```bash
git add lib/server/queries/admin/rfps.ts "app/(protected)/rfps/page.tsx"
git commit -m "feat: add search and status filter to RFPs list page"
```

---

## Task 7: 입점 심사 목록 필터

**Files:**
- Modify: `lib/server/queries/admin/review.ts`
- Modify: `app/(protected)/review/page.tsx`

- [ ] **Step 1: `lib/server/queries/admin/review.ts` — `listApplications`로 리네임 + 필터 추가**

`listPendingApplications` 함수를 `listApplications`로 리네임하고 필터 파라미터를 추가한다. 기존 `getApplicationDetail`은 그대로 유지한다.

```typescript
import { and, desc, eq } from 'drizzle-orm';
import { workspaces, verificationApplications, pgProfiles, bizProfiles } from '@/lib/db/schema';
import { actionDb } from '@/lib/server/actions/auth/_shared';
import { getWorkspaceAdminUser } from './workspaceOwner';

type DB = ReturnType<typeof actionDb>;

export interface PendingApplicationRow {
  applicationId: string;
  workspaceId: string;
  workspaceName: string;
  orgType: string;
  status: string;
  submittedAt: Date;
  reviewedAt: Date | null;
}

export async function listApplications(
  opts: { status?: string; type?: string } = {},
  db: DB = actionDb(),
): Promise<PendingApplicationRow[]> {
  const { status, type } = opts;
  const rows = await db
    .select({
      applicationId: verificationApplications.id,
      workspaceId: workspaces.id,
      workspaceName: workspaces.name,
      orgType: verificationApplications.orgType,
      status: verificationApplications.status,
      submittedAt: verificationApplications.submittedAt,
      reviewedAt: verificationApplications.reviewedAt,
    })
    .from(verificationApplications)
    .innerJoin(workspaces, eq(verificationApplications.workspaceId, workspaces.id))
    .where(
      and(
        status && status !== 'all'
          ? eq(
              verificationApplications.status,
              status as
                | 'submitted'
                | 'review_pending'
                | 'needs_more_info'
                | 'approved'
                | 'rejected',
            )
          : undefined,
        type && type !== 'all'
          ? eq(verificationApplications.orgType, type)
          : undefined,
      ),
    )
    .orderBy(desc(verificationApplications.submittedAt));
  return rows as PendingApplicationRow[];
}

export async function getApplicationDetail(applicationId: string, db: DB = actionDb()) {
  const [app] = await db
    .select()
    .from(verificationApplications)
    .where(eq(verificationApplications.id, applicationId));
  if (!app) return null;

  const [ws] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, app.workspaceId));

  const [profile] = await db
    .select()
    .from(pgProfiles)
    .where(eq(pgProfiles.workspaceId, app.workspaceId));

  const currentBizProfile =
    ws.bizProfileId
      ? (await db
          .select()
          .from(bizProfiles)
          .where(eq(bizProfiles.id, ws.bizProfileId))
          .limit(1))[0] ?? null
      : null;

  const ownerContact = await getWorkspaceAdminUser(app.workspaceId, db);

  return {
    application: app,
    workspace: ws,
    pgProfile: profile ?? null,
    bizProfile: currentBizProfile,
    ownerContact,
  };
}
```

- [ ] **Step 2: `app/(protected)/review/page.tsx` — `listApplications` 사용 + 필터 UI 추가**

파일 전체를 다음으로 교체한다.

```tsx
import { listApplications } from '@/lib/server/queries/admin/review';
import Link from 'next/link';
import { AdminStatusBadge } from '@/components/AdminStatusBadge';

export default async function ReviewListPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; type?: string }>;
}) {
  const { status, type } = await searchParams;
  const apps = await listApplications({ status, type });

  return (
    <div className="space-y-4 p-6">
      <h1 className="text-headline-small font-semibold">입점 심사</h1>
      <form method="GET" className="flex gap-2">
        <select
          name="type"
          defaultValue={type ?? ''}
          className="rounded border border-outline-variant px-3 py-1.5 text-body-small bg-surface"
        >
          <option value="">전체 유형</option>
          <option value="buyer">구매사</option>
          <option value="pg">PG사</option>
        </select>
        <select
          name="status"
          defaultValue={status ?? ''}
          className="rounded border border-outline-variant px-3 py-1.5 text-body-small bg-surface"
        >
          <option value="">전체 상태</option>
          <option value="submitted">신청</option>
          <option value="review_pending">심사 중</option>
          <option value="needs_more_info">추가 정보 요청</option>
          <option value="approved">승인</option>
          <option value="rejected">거절</option>
        </select>
        <button
          type="submit"
          className="rounded bg-primary text-on-primary px-3 py-1.5 text-label-small"
        >
          검색
        </button>
      </form>
      <div className="rounded border border-outline-variant overflow-hidden">
        <table className="w-full text-body-small">
          <thead>
            <tr className="border-b border-outline-variant bg-surface-container-low">
              <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium">유형</th>
              <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium">회사명</th>
              <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium">신청일</th>
              <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium">상태</th>
            </tr>
          </thead>
          <tbody>
            {apps.map((app) => (
              <tr
                key={app.applicationId}
                className="border-b border-outline-variant last:border-0 hover:bg-surface-container-low"
              >
                <td className="px-4 py-3">
                  <span className="text-label-small rounded bg-surface-container px-2 py-0.5">
                    {app.orgType === 'buyer' ? '구매사' : 'PG사'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <Link
                    href={`/review/${app.applicationId}`}
                    className="text-primary hover:underline"
                  >
                    {app.workspaceName}
                  </Link>
                </td>
                <td className="px-4 py-3 md-numeric text-on-surface-variant">
                  {new Date(app.submittedAt).toLocaleString('ko-KR')}
                </td>
                <td className="px-4 py-3">
                  <AdminStatusBadge status={app.status} />
                </td>
              </tr>
            ))}
            {apps.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-on-surface-variant">
                  신청이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: 타입 검사**

```bash
pnpm typecheck
```

Expected: 에러 없음

- [ ] **Step 4: 브라우저 확인**

`http://localhost:3001/review` 접속 후:
- 유형 드롭다운 + 상태 드롭다운 표시 확인
- 필터 없이 접속 시 전체 신청 목록 표시 확인 (이전엔 `submitted`만 표시)
- `?status=approved` 필터로 승인된 신청만 표시되는지 확인

- [ ] **Step 5: 커밋**

```bash
git add lib/server/queries/admin/review.ts "app/(protected)/review/page.tsx"
git commit -m "feat: add type and status filter to review list page"
```

---

## Task 8: 구매사 · 판매사 상세 페이지 멤버 섹션 추가

**Files:**
- Modify: `app/(protected)/buyers/[id]/page.tsx`
- Modify: `app/(protected)/sellers/[id]/page.tsx`

- [ ] **Step 1: `app/(protected)/buyers/[id]/page.tsx` — 멤버 섹션 추가**

파일 전체를 다음으로 교체한다. `getBuyerDetail` import에 `getWorkspaceMembers`를 추가하고, 멤버 섹션과 [제외] 버튼을 추가한다. 기존의 `/admin/rfps/` 링크 버그도 수정한다.

```tsx
import { notFound } from 'next/navigation';
import { getBuyerDetail } from '@/lib/server/queries/admin/buyers';
import { getWorkspaceMembers } from '@/lib/server/queries/admin/workspaceMembers';
import { removeWorkspaceMemberAction } from '@/lib/server/actions/admin/removeWorkspaceMemberAction';
import { AdminStatusBadge } from '@/components/AdminStatusBadge';
import Link from 'next/link';

export default async function BuyerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [detail, members] = await Promise.all([
    getBuyerDetail(id),
    getWorkspaceMembers(id),
  ]);
  if (!detail) notFound();

  const { workspace, rfps } = detail;

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <h1 className="text-headline-small font-semibold">{workspace.name}</h1>
        <AdminStatusBadge status={workspace.status} />
      </div>

      <section>
        <h2 className="text-title-small font-semibold mb-3">멤버 ({members.length}명)</h2>
        <div className="rounded border border-outline-variant overflow-hidden">
          <table className="w-full text-body-small">
            <thead>
              <tr className="border-b border-outline-variant bg-surface-container-low">
                <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium">이름</th>
                <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium">이메일</th>
                <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium">역할</th>
                <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium">가입일</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr
                  key={m.userId}
                  className="border-b border-outline-variant last:border-0"
                >
                  <td className="px-4 py-3">
                    <Link href={`/users/${m.userId}`} className="text-primary hover:underline">
                      {m.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-on-surface-variant">{m.email}</td>
                  <td className="px-4 py-3 text-label-small">
                    {m.role === 'admin' ? '관리자' : '멤버'}
                  </td>
                  <td className="px-4 py-3 md-numeric text-label-small text-on-surface-variant">
                    {new Date(m.joinedAt).toLocaleDateString('ko-KR')}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <form action={removeWorkspaceMemberAction.bind(null, workspace.id, m.userId)}>
                      <button
                        type="submit"
                        disabled={m.isLastAdmin}
                        className="text-label-small text-error hover:underline disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        제외
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
              {members.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-on-surface-variant">
                    멤버 없음
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-title-small font-semibold mb-3">RFP 현황 ({rfps.length}건)</h2>
        <div className="rounded border border-outline-variant overflow-hidden">
          <table className="w-full text-body-small">
            <thead>
              <tr className="border-b border-outline-variant bg-surface-container-low">
                <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium">코드</th>
                <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium">제목</th>
                <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium">상태</th>
                <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium">마감</th>
              </tr>
            </thead>
            <tbody>
              {rfps.map((rfp) => (
                <tr
                  key={rfp.id}
                  className="border-b border-outline-variant last:border-0 hover:bg-surface-container-low"
                >
                  <td className="px-4 py-3 md-numeric text-label-small">{rfp.code}</td>
                  <td className="px-4 py-3">
                    <Link href={`/rfps/${rfp.id}`} className="text-primary hover:underline">
                      {rfp.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <AdminStatusBadge status={rfp.status} />
                  </td>
                  <td className="px-4 py-3 md-numeric text-label-small text-on-surface-variant">
                    {new Date(rfp.deadline).toLocaleDateString('ko-KR')}
                  </td>
                </tr>
              ))}
              {rfps.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-on-surface-variant">
                    RFP 없음
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 2: `app/(protected)/sellers/[id]/page.tsx` — 멤버 섹션 추가**

파일 상단에 다음 import를 추가하고, 기존 `<section>` 블록들 앞에 멤버 섹션을 삽입한다. 기존의 `/admin/rfps/` 링크 버그도 수정한다.

파일 전체를 다음으로 교체한다.

```tsx
import { notFound } from 'next/navigation';
import { getSellerDetail } from '@/lib/server/queries/admin/sellers';
import { getWorkspaceMembers } from '@/lib/server/queries/admin/workspaceMembers';
import { removeWorkspaceMemberAction } from '@/lib/server/actions/admin/removeWorkspaceMemberAction';
import { AdminStatusBadge } from '@/components/AdminStatusBadge';
import Link from 'next/link';

export default async function SellerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [detail, members] = await Promise.all([
    getSellerDetail(id),
    getWorkspaceMembers(id),
  ]);
  if (!detail) notFound();

  const { workspace, pgProfile, bids, ownerContact } = detail;

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <h1 className="text-headline-small font-semibold">{workspace.name}</h1>
        <AdminStatusBadge status={workspace.status} />
      </div>

      {pgProfile && (
        <section>
          <h2 className="text-title-small font-semibold mb-3">PG 프로필</h2>
          <div className="rounded border border-outline-variant divide-y divide-outline-variant">
            {pgProfile.bizNo && (
              <div className="px-4 py-3 flex gap-4">
                <span className="text-label-small text-on-surface-variant w-32 shrink-0">사업자번호</span>
                <span className="text-body-small md-numeric">{pgProfile.bizNo}</span>
              </div>
            )}
            {pgProfile.serviceScope?.paymentMethods &&
              pgProfile.serviceScope.paymentMethods.length > 0 && (
                <div className="px-4 py-3 flex gap-4">
                  <span className="text-label-small text-on-surface-variant w-32 shrink-0">결제수단</span>
                  <span className="text-body-small">
                    {pgProfile.serviceScope.paymentMethods.join(', ')}
                  </span>
                </div>
              )}
            {pgProfile.serviceScope?.volumeRange && (
              <div className="px-4 py-3 flex gap-4">
                <span className="text-label-small text-on-surface-variant w-32 shrink-0">거래량 규모</span>
                <span className="text-body-small">{pgProfile.serviceScope.volumeRange}</span>
              </div>
            )}
            {ownerContact && (
              <div className="px-4 py-3 flex gap-4">
                <span className="text-label-small text-on-surface-variant w-32 shrink-0">담당자</span>
                <span className="text-body-small">
                  {ownerContact.name}
                  <span className="text-on-surface-variant ml-2">({ownerContact.email})</span>
                  {ownerContact.phone && (
                    <span className="ml-2 md-numeric">{ownerContact.phone}</span>
                  )}
                </span>
              </div>
            )}
            {pgProfile.slaDays != null && (
              <div className="px-4 py-3 flex gap-4">
                <span className="text-label-small text-on-surface-variant w-32 shrink-0">SLA (일)</span>
                <span className="text-body-small md-numeric">{pgProfile.slaDays}일</span>
              </div>
            )}
          </div>
        </section>
      )}

      <section>
        <h2 className="text-title-small font-semibold mb-3">멤버 ({members.length}명)</h2>
        <div className="rounded border border-outline-variant overflow-hidden">
          <table className="w-full text-body-small">
            <thead>
              <tr className="border-b border-outline-variant bg-surface-container-low">
                <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium">이름</th>
                <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium">이메일</th>
                <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium">역할</th>
                <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium">가입일</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.userId} className="border-b border-outline-variant last:border-0">
                  <td className="px-4 py-3">
                    <Link href={`/users/${m.userId}`} className="text-primary hover:underline">
                      {m.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-on-surface-variant">{m.email}</td>
                  <td className="px-4 py-3 text-label-small">
                    {m.role === 'admin' ? '관리자' : '멤버'}
                  </td>
                  <td className="px-4 py-3 md-numeric text-label-small text-on-surface-variant">
                    {new Date(m.joinedAt).toLocaleDateString('ko-KR')}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <form
                      action={removeWorkspaceMemberAction.bind(null, workspace.id, m.userId)}
                    >
                      <button
                        type="submit"
                        disabled={m.isLastAdmin}
                        className="text-label-small text-error hover:underline disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        제외
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
              {members.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-on-surface-variant">
                    멤버 없음
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-title-small font-semibold mb-3">최근 입찰 ({bids.length}건)</h2>
        <div className="rounded border border-outline-variant overflow-hidden">
          <table className="w-full text-body-small">
            <thead>
              <tr className="border-b border-outline-variant bg-surface-container-low">
                <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium">RFP ID</th>
                <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium">상태</th>
                <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium">제출일</th>
              </tr>
            </thead>
            <tbody>
              {bids.map((bid) => (
                <tr
                  key={bid.id}
                  className="border-b border-outline-variant last:border-0 hover:bg-surface-container-low"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/rfps/${bid.rfpId}`}
                      className="text-primary hover:underline md-numeric text-label-small"
                    >
                      {bid.rfpId.slice(0, 8)}…
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <AdminStatusBadge status={bid.status} />
                  </td>
                  <td className="px-4 py-3 md-numeric text-label-small text-on-surface-variant">
                    {new Date(bid.submittedAt).toLocaleDateString('ko-KR')}
                  </td>
                </tr>
              ))}
              {bids.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-on-surface-variant">
                    입찰 없음
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 3: 타입 검사**

```bash
pnpm typecheck
```

Expected: 에러 없음

- [ ] **Step 4: 브라우저 확인**

`http://localhost:3001/buyers` 에서 구매사 클릭 → 상세 페이지:
- 멤버 섹션이 RFP 현황 섹션 위에 표시되는지 확인
- 멤버 이름 클릭 → `/users/[id]` 상세 페이지로 이동 확인
- 마지막 admin의 [제외] 버튼 비활성화 확인

`http://localhost:3001/sellers` 에서 판매사 클릭 → 상세 페이지:
- PG 프로필 섹션, 멤버 섹션, 입찰 섹션 순서로 표시 확인

- [ ] **Step 5: 커밋**

```bash
git add "app/(protected)/buyers/[id]/page.tsx" "app/(protected)/sellers/[id]/page.tsx"
git commit -m "feat: add workspace member section to buyer and seller detail pages"
```

---

## 완료 체크리스트

- [ ] Task 1: 유저 쿼리 (`users.ts`, `workspaceMembers.ts`)
- [ ] Task 2: 유저 서버 액션 (suspend, unsuspend, removeWorkspaceMember)
- [ ] Task 3: AdminShell 네비게이션 + `/users` 목록
- [ ] Task 4: `/users/[id]` 상세
- [ ] Task 5: 구매사·판매사 목록 검색/필터
- [ ] Task 6: RFP 목록 검색/필터
- [ ] Task 7: 입점 심사 목록 필터
- [ ] Task 8: 구매사·판매사 상세 멤버 섹션
