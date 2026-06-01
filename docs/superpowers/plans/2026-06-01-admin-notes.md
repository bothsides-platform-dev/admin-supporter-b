# 어드민 노트 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 심사 상세 페이지에 어드민 노트 작성·목록·삭제 기능을 추가한다.

**Architecture:** 새 쿼리 파일(`getAdminNotes`)과 삭제 액션(`deleteAdminNoteAction`)을 추가하고, review/[id]/page.tsx 하단에 노트 섹션을 삽입한다. 생성 액션(`createAdminNoteAction`)은 이미 존재하며 재사용한다. 노트는 `entityType='workspace'`, `entityId=workspace.id`로 저장된다.

**Tech Stack:** Next.js 15 (App Router), Drizzle ORM v0.45, TypeScript, Tailwind CSS

---

## File Map

| 파일 | 유형 |
|---|---|
| `lib/server/queries/admin/adminNotes.ts` | 신규 |
| `lib/server/actions/admin/deleteAdminNoteAction.ts` | 신규 |
| `app/(protected)/review/[id]/page.tsx` | 수정 |

---

## Task 1: adminNotes 쿼리 생성

**Files:**
- Create: `lib/server/queries/admin/adminNotes.ts`

- [ ] **Step 1: `lib/server/queries/admin/adminNotes.ts` 생성**

```typescript
import { and, desc, eq } from 'drizzle-orm';
import { adminNotes } from '@/lib/db/schema';
import { actionDb } from '@/lib/server/actions/auth/_shared';

export type AdminNoteRow = {
  id: string;
  body: string;
  createdBy: string;
  createdAt: Date;
};

export async function getAdminNotes(
  entityType: string,
  entityId: string,
): Promise<AdminNoteRow[]> {
  return actionDb()
    .select({
      id: adminNotes.id,
      body: adminNotes.body,
      createdBy: adminNotes.createdBy,
      createdAt: adminNotes.createdAt,
    })
    .from(adminNotes)
    .where(
      and(
        eq(adminNotes.entityType, entityType),
        eq(adminNotes.entityId, entityId),
      ),
    )
    .orderBy(desc(adminNotes.createdAt)) as Promise<AdminNoteRow[]>;
}
```

- [ ] **Step 2: 타입 검사**

```bash
pnpm typecheck
```

Expected: 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add lib/server/queries/admin/adminNotes.ts
git commit -m "feat: add getAdminNotes query"
```

---

## Task 2: deleteAdminNoteAction 생성

**Files:**
- Create: `lib/server/actions/admin/deleteAdminNoteAction.ts`

- [ ] **Step 1: `lib/server/actions/admin/deleteAdminNoteAction.ts` 생성**

```typescript
'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { adminNotes, adminAuditLogs } from '@/lib/db/schema';
import { requireAdminSession } from '@/lib/auth/admin-session';
import { actionDb } from '@/lib/server/actions/auth/_shared';

type Result = { ok: true } | { ok: false; error: string };

export async function deleteAdminNoteAction(
  noteId: string,
  revalidate?: string,
): Promise<Result> {
  const session = await requireAdminSession();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await actionDb().transaction(async (tx: any) => {
    await tx.delete(adminNotes).where(eq(adminNotes.id, noteId));
    await tx.insert(adminAuditLogs).values({
      actor: session.adminId,
      action: 'note.delete',
      entityType: 'admin_note',
      entityId: noteId,
      payloadJson: {},
    });
  });

  if (revalidate) revalidatePath(revalidate);
  return { ok: true };
}
```

- [ ] **Step 2: 타입 검사**

```bash
pnpm typecheck
```

Expected: 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add lib/server/actions/admin/deleteAdminNoteAction.ts
git commit -m "feat: add deleteAdminNoteAction"
```

---

## Task 3: 심사 상세 페이지에 노트 섹션 추가

**Files:**
- Modify: `app/(protected)/review/[id]/page.tsx`

현재 파일을 다음 전체 코드로 교체한다. 기존 코드 대비 변경점:
1. 상단에 `getAdminNotes`, `deleteAdminNoteAction`, `createAdminNoteAction` import 추가
2. `getApplicationDetail` 호출 뒤 `getAdminNotes` 호출 추가
3. `saveNote` inline server action 추가
4. JSX 맨 아래에 어드민 노트 섹션 추가

- [ ] **Step 1: 파일 전체를 다음으로 교체한다**

```tsx
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getApplicationDetail } from '@/lib/server/queries/admin/review';
import { getAdminNotes } from '@/lib/server/queries/admin/adminNotes';
import { AdminStatusBadge } from '@/components/AdminStatusBadge';
import { approveWorkspaceAction } from '@/lib/server/actions/admin/approveWorkspaceAction';
import { rejectWorkspaceAction } from '@/lib/server/actions/admin/rejectWorkspaceAction';
import { requestMoreInfoAction } from '@/lib/server/actions/admin/requestMoreInfoAction';
import { createAdminNoteAction } from '@/lib/server/actions/admin/createAdminNoteAction';
import { deleteAdminNoteAction } from '@/lib/server/actions/admin/deleteAdminNoteAction';
import { GRADE_LABELS } from '@/lib/types/biz-profile';
import type { MerchantGrade } from '@/lib/types/biz-profile';

const ALL_GRADES: MerchantGrade[] = ['small', 'sme1', 'sme2', 'sme3', 'general'];

export default async function ReviewDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detail = await getApplicationDetail(id);

  if (!detail) notFound();

  const { application, workspace, pgProfile, bizProfile, ownerContact } = detail;
  const notes = await getAdminNotes('workspace', workspace.id);

  const canAct =
    application.status === 'submitted' || application.status === 'needs_more_info';

  async function approveAction(formData: FormData) {
    'use server';
    const gradeRaw = formData.get('grade');
    const grade = gradeRaw ? (gradeRaw as MerchantGrade) : undefined;
    await approveWorkspaceAction(undefined, workspace.id, grade);
  }

  async function rejectAction(formData: FormData) {
    'use server';
    const reason = String(formData.get('reason') ?? '').trim();
    await rejectWorkspaceAction(undefined, workspace.id, reason);
  }

  async function moreInfoAction(formData: FormData) {
    'use server';
    const reason = String(formData.get('reason') ?? '').trim();
    await requestMoreInfoAction(undefined, workspace.id, reason);
  }

  async function saveNote(formData: FormData) {
    'use server';
    const body = String(formData.get('body') ?? '').trim();
    await createAdminNoteAction(undefined, 'workspace', workspace.id, body, `/review/${id}`);
  }

  return (
    <div className="space-y-6 p-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <Link href="/review" className="text-on-surface-variant hover:text-on-surface text-body-small">
          ← 목록
        </Link>
        <h1 className="text-headline-small font-semibold">{workspace.name}</h1>
        <span className="text-label-small rounded bg-surface-container px-2 py-0.5">
          {application.orgType === 'buyer' ? '구매사' : 'PG사'}
        </span>
      </div>

      {/* Application Info */}
      <section className="rounded border border-outline-variant">
        <div className="border-b border-outline-variant px-4 py-2 bg-surface-container-low">
          <h2 className="text-title-small font-medium">신청 정보</h2>
        </div>
        <div className="px-4 py-3 grid grid-cols-2 gap-3 text-body-small">
          <div>
            <span className="text-on-surface-variant">신청일</span>
            <span className="ml-3 md-numeric">{new Date(application.submittedAt).toLocaleString('ko-KR')}</span>
          </div>
          <div>
            <span className="text-on-surface-variant">상태</span>
            <span className="ml-3"><AdminStatusBadge status={application.status} /></span>
          </div>
          <div>
            <span className="text-on-surface-variant">워크스페이스 상태</span>
            <span className="ml-3"><AdminStatusBadge status={workspace.status} /></span>
          </div>
        </div>
      </section>

      {/* 처리 이력 — needs_more_info 또는 rejected 상태일 때 표시 */}
      {(application.status === 'needs_more_info' || application.status === 'rejected') && (
        <section className="rounded border border-outline-variant">
          <div className="border-b border-outline-variant px-4 py-2 bg-surface-container-low">
            <h2 className="text-title-small font-medium">처리 이력</h2>
          </div>
          <div className="px-4 py-3 grid grid-cols-2 gap-3 text-body-small">
            <div>
              <span className="text-on-surface-variant">처리 상태</span>
              <span className="ml-3"><AdminStatusBadge status={application.status} /></span>
            </div>
            {application.reviewedAt && (
              <div>
                <span className="text-on-surface-variant">처리일</span>
                <span className="ml-3 md-numeric">
                  {new Date(application.reviewedAt).toLocaleString('ko-KR')}
                </span>
              </div>
            )}
            {application.reviewedBy && (
              <div className="col-span-2">
                <span className="text-on-surface-variant">처리자</span>
                <span className="ml-3">{application.reviewedBy}</span>
              </div>
            )}
            {application.reason && (
              <div className="col-span-2">
                <span className="text-on-surface-variant">사유</span>
                <span className="ml-3">{application.reason}</span>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Buyer biz profile (구매사 only) */}
      {application.orgType === 'buyer' && bizProfile && (
        <section className="rounded border border-outline-variant">
          <div className="border-b border-outline-variant px-4 py-2 bg-surface-container-low">
            <h2 className="text-title-small font-medium">사업자 정보</h2>
          </div>
          <div className="px-4 py-3 grid grid-cols-2 gap-3 text-body-small">
            {bizProfile.bizNo && (
              <div>
                <span className="text-on-surface-variant">사업자번호</span>
                <span className="ml-3 md-numeric">{bizProfile.bizNo}</span>
              </div>
            )}
            {bizProfile.grade && (
              <div>
                <span className="text-on-surface-variant">현재 등급</span>
                <span className="ml-3">{GRADE_LABELS[bizProfile.grade as MerchantGrade]}</span>
              </div>
            )}
            {ownerContact && (
              <div className="col-span-2">
                <span className="text-on-surface-variant">담당자</span>
                <span className="ml-3">
                  {ownerContact.name} · {ownerContact.email} · {ownerContact.phone ?? '—'}
                </span>
              </div>
            )}
          </div>
        </section>
      )}

      {/* PG Profile (판매사 only) */}
      {application.orgType === 'pg' && pgProfile && (
        <section className="rounded border border-outline-variant">
          <div className="border-b border-outline-variant px-4 py-2 bg-surface-container-low">
            <h2 className="text-title-small font-medium">PG 프로필</h2>
          </div>
          <div className="px-4 py-3 grid grid-cols-2 gap-3 text-body-small">
            {pgProfile.bizNo && (
              <div>
                <span className="text-on-surface-variant">사업자번호</span>
                <span className="ml-3 md-numeric">{pgProfile.bizNo}</span>
              </div>
            )}
            {pgProfile.slaDays != null && (
              <div>
                <span className="text-on-surface-variant">SLA (일)</span>
                <span className="ml-3 md-numeric">{pgProfile.slaDays}</span>
              </div>
            )}
            {pgProfile.serviceScope?.paymentMethods && (
              <div className="col-span-2">
                <span className="text-on-surface-variant">결제 수단</span>
                <span className="ml-3">{pgProfile.serviceScope.paymentMethods.join(', ')}</span>
              </div>
            )}
            {pgProfile.serviceScope?.industries && (
              <div className="col-span-2">
                <span className="text-on-surface-variant">업종</span>
                <span className="ml-3">{pgProfile.serviceScope.industries.join(', ')}</span>
              </div>
            )}
            {ownerContact && (
              <div className="col-span-2">
                <span className="text-on-surface-variant">담당자</span>
                <span className="ml-3">
                  {ownerContact.name} · {ownerContact.email} · {ownerContact.phone ?? '—'}
                </span>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Actions — submitted 또는 needs_more_info 상태에서만 표시 */}
      {canAct && (
        <section className="space-y-4">
          <h2 className="text-title-small font-medium">심사 처리</h2>

          {/* 승인 카드 */}
          <div className="rounded border border-primary p-4 space-y-3">
            <h3 className="text-body-medium font-medium text-primary">승인</h3>
            <form action={approveAction} className="space-y-3">
              {application.orgType === 'buyer' && (
                <div className="space-y-1">
                  <label
                    htmlFor="grade-select"
                    className="block text-body-small text-on-surface-variant"
                  >
                    가맹점 등급 <span className="text-error">*</span>
                  </label>
                  <select
                    id="grade-select"
                    name="grade"
                    required
                    defaultValue={bizProfile?.grade ?? ''}
                    className="rounded border border-outline px-3 py-2 text-body-small bg-surface focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="" disabled>등급 선택</option>
                    {ALL_GRADES.map((g) => (
                      <option key={g} value={g}>
                        {GRADE_LABELS[g]}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <button
                type="submit"
                className="rounded bg-primary px-4 py-2 text-label-large text-on-primary hover:bg-primary/90"
              >
                승인
              </button>
            </form>
          </div>

          {/* 반려 카드 */}
          <div className="rounded border border-error p-4 space-y-3">
            <h3 className="text-body-medium font-medium text-error">반려</h3>
            <form action={rejectAction} className="space-y-2">
              <label className="block text-body-small text-on-surface-variant">반려 사유</label>
              <textarea
                name="reason"
                rows={3}
                required
                placeholder="반려 사유를 입력하세요"
                className="w-full rounded border border-outline px-3 py-2 text-body-small bg-surface resize-none focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <button
                type="submit"
                className="rounded border border-error px-4 py-2 text-label-large text-error hover:bg-error-container"
              >
                반려
              </button>
            </form>
          </div>

          {/* 보완 요청 / 재요청 카드 */}
          <div className="rounded border border-outline-variant p-4 space-y-3">
            <h3 className="text-body-medium font-medium text-on-surface">
              {application.status === 'needs_more_info' ? '재요청' : '보완 요청'}
            </h3>
            <form action={moreInfoAction} className="space-y-2">
              <label className="block text-body-small text-on-surface-variant">요청 사유</label>
              <textarea
                name="reason"
                rows={3}
                required
                placeholder="요청 사유를 입력하세요"
                className="w-full rounded border border-outline px-3 py-2 text-body-small bg-surface resize-none focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <button
                type="submit"
                className="rounded border border-outline px-4 py-2 text-label-large text-on-surface hover:bg-surface-container-low"
              >
                {application.status === 'needs_more_info' ? '재요청' : '보완 요청'}
              </button>
            </form>
          </div>
        </section>
      )}

      {/* 어드민 노트 */}
      <section className="space-y-3">
        <h2 className="text-title-small font-medium">어드민 노트</h2>

        {notes.length === 0 ? (
          <p className="text-body-small text-on-surface-variant">노트가 없습니다.</p>
        ) : (
          <div className="rounded border border-outline-variant divide-y divide-outline-variant overflow-hidden">
            {notes.map((note) => {
              async function doDeleteNote() {
                'use server';
                await deleteAdminNoteAction(note.id, `/review/${id}`);
              }
              return (
                <div key={note.id} className="px-4 py-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-label-small text-on-surface-variant">
                      {note.createdBy} · {new Date(note.createdAt).toLocaleString('ko-KR')}
                    </span>
                    <form action={doDeleteNote}>
                      <button
                        type="submit"
                        className="text-label-small text-error hover:underline"
                      >
                        삭제
                      </button>
                    </form>
                  </div>
                  <p className="text-body-small whitespace-pre-wrap">{note.body}</p>
                </div>
              );
            })}
          </div>
        )}

        <form action={saveNote} className="space-y-2">
          <textarea
            name="body"
            rows={3}
            required
            placeholder="메모를 입력하세요"
            className="w-full rounded border border-outline px-3 py-2 text-body-small bg-surface resize-none focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <button
            type="submit"
            className="rounded border border-outline px-4 py-2 text-label-large text-on-surface hover:bg-surface-container-low"
          >
            저장
          </button>
        </form>
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

- [ ] **Step 3: 커밋**

```bash
git add "app/(protected)/review/[id]/page.tsx"
git commit -m "feat: add admin notes section to review detail page"
```
