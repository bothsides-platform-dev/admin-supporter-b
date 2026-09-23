import { listUsersPage } from '@/lib/server/queries/admin/users';
import { AdminListControls } from '@/components/AdminListControls';
import { AdminListPagination } from '@/components/AdminListPagination';
import { AdminDataTable, type AdminTableColumn } from '@/components/AdminDataTable';
import type { UserRow } from '@/lib/server/queries/admin/users';
import { listQuery, type ListParams } from '@/lib/admin-list';
import Link from 'next/link';
import { AdminStatusBadge } from '@/components/AdminStatusBadge';
import { formatDateKST } from '@/lib/utils';

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<ListParams>;
}) {
  const params = await searchParams;
  const { q, status } = params;
  const { rows: userList, total, page } = await listUsersPage(params);
  const returnTo = `/users?${listQuery(params)}`;
  const filtered = Boolean(q || status || params.from || params.to);
  const columns: AdminTableColumn<UserRow>[] = [
    { key: 'name', label: '이름', render: (u) => <Link href={`/users/${u.id}?returnTo=${encodeURIComponent(returnTo)}`} className="text-primary hover:underline">{u.name}</Link> },
    { key: 'email', label: '이메일', render: (u) => <span className="text-on-surface-variant">{u.email}</span> },
    { key: 'status', label: '상태', render: (u) => <AdminStatusBadge status={u.deletedAt ? 'deleted' : u.status} /> },
    { key: 'workspaceCount', label: '소속 워크스페이스 수', render: (u) => <span className="md-numeric text-label-small text-on-surface-variant">{u.workspaceCount}개</span> },
    { key: 'createdAt', label: '가입일', render: (u) => <span className="md-numeric text-label-small text-on-surface-variant">{formatDateKST(u.createdAt)}</span> },
  ];

  return (
    <div className="space-y-4">
      <h1 className="text-headline-small font-semibold">회원</h1>
      <AdminListControls path="/users" params={params} sortOptions={[{ value: 'name', label: '이름순' }]} dateLabel="가입일">
        <input
          name="q"
          aria-label="회원 이름 또는 이메일 검색"
          defaultValue={q ?? ''}
          placeholder="이름 또는 이메일 검색"
          className="rounded border border-outline-variant px-3 py-1.5 text-body-small bg-surface focus:outline-none focus:ring-1 focus:ring-primary w-64"
        />
        <select
          name="status"
          aria-label="회원 상태"
          defaultValue={status ?? ''}
          className="rounded border border-outline-variant px-3 py-1.5 text-body-small bg-surface"
        >
          <option value="">전체 (활성/정지)</option>
          <option value="active">활성</option>
          <option value="suspended">정지</option>
          <option value="deleted">탈퇴</option>
        </select>
      </AdminListControls>
      <AdminDataTable caption="회원 목록" rows={userList} columns={columns} getKey={(u) => u.id} emptyMessage={filtered ? '검색 조건에 맞는 회원이 없습니다.' : '등록된 회원이 없습니다.'} />
      <AdminListPagination path="/users" params={params} page={page} total={total} />
    </div>
  );
}
