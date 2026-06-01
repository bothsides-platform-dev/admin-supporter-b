# 어드민 노트 설계

**날짜**: 2026-06-01  
**범위**: 심사 상세 페이지(`/review/[id]`)에 어드민 노트 작성·조회·삭제  
**제외**: 다른 상세 페이지 확장 (buyers/sellers/users), 노트 수정

---

## 1. 배경 및 목표

`adminNotes` 테이블과 `createAdminNoteAction`이 이미 존재하지만 UI가 없다. 심사 담당자가 검토 중 메모(전화 내용, 특이사항 등)를 남기고, 다음 담당자가 이를 참조할 수 있게 한다.

---

## 2. 범위

| # | 기능 | 유형 |
|---|---|---|
| 1 | 노트 조회 쿼리 | 신규 |
| 2 | 노트 삭제 액션 | 신규 |
| 3 | 심사 상세 페이지 노트 섹션 | 기존 수정 |

**DB 마이그레이션 없음** — `admin_notes` 테이블 이미 존재.

---

## 3. 설계

### 3.1 노트 저장 키

- `entityType = 'workspace'`
- `entityId = workspace.id`

심사가 완료(승인/반려)된 후에도 워크스페이스에 노트가 남아 재신청 시 참조 가능.

### 3.2 신규 쿼리 — `lib/server/queries/admin/adminNotes.ts`

```typescript
export type AdminNoteRow = {
  id: string;
  body: string;
  createdBy: string;
  createdAt: Date;
};

export async function getAdminNotes(
  entityType: string,
  entityId: string,
): Promise<AdminNoteRow[]>
// adminNotes 테이블에서 entityType + entityId로 필터, createdAt DESC
```

### 3.3 신규 액션 — `lib/server/actions/admin/deleteAdminNoteAction.ts`

```typescript
export async function deleteAdminNoteAction(noteId: string): Promise<Result>
// requireAdminSession + transaction(delete + auditLog) + revalidatePath
// auditLog: action='note.delete', entityType='admin_note', entityId=noteId
```

### 3.4 노트 섹션 UI — `app/(protected)/review/[id]/page.tsx` 수정

위치: 페이지 맨 아래 (액션 섹션 이후)

**노트 목록**: 최신순. 각 노트 행에:
- 작성자(`createdBy`) + 작성일(`createdAt` toLocaleString)
- 본문(`body`)
- [삭제] 버튼 → `deleteAdminNoteAction(note.id)` inline 'use server'

**노트 작성 폼**:
- `<textarea name="body" rows={3} required placeholder="메모를 입력하세요">`
- 저장 버튼 → `createAdminNoteAction(undefined, 'workspace', workspace.id, body, revalidate)` inline 'use server'

**빈 상태**: 노트가 없을 때 "노트가 없습니다." 표시.

---

## 4. 제외 항목

- 노트 수정
- 다른 상세 페이지(buyers/sellers/users) 확장
- 노트 검색
