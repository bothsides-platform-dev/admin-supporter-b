import Link from 'next/link';
import { AdminDataTable, type AdminTableColumn } from '@/components/AdminDataTable';
import { ConfirmButton } from '@/components/ConfirmButton';
import { toActionState } from '@/lib/action-state';
import { removeWorkspaceMemberAction } from '@/lib/server/actions/admin/removeWorkspaceMemberAction';
import type { getWorkspaceMembers } from '@/lib/server/queries/admin/workspaceMembers';
import { formatDateKST } from '@/lib/utils';

type Member = Awaited<ReturnType<typeof getWorkspaceMembers>>[number];

/** 구매사·판매사 상세의 멤버 표. 제외 버튼은 `canManage` 일 때만 보인다. */
export function WorkspaceMembersTable({ workspaceId, members, canManage }: {
  workspaceId: string;
  members: Member[];
  canManage: boolean;
}) {
  const columns: AdminTableColumn<Member>[] = [
    { key: 'name', label: '이름', render: (m) => <Link href={`/users/${m.userId}`} className="text-primary hover:underline">{m.name}</Link> },
    { key: 'email', label: '이메일', render: (m) => <span className="text-on-surface-variant">{m.email}</span> },
    { key: 'role', label: '역할', cellClassName: 'text-label-small', render: (m) => (m.role === 'admin' ? '관리자' : '멤버') },
    { key: 'joinedAt', label: '가입일', cellClassName: 'md-numeric text-label-small text-on-surface-variant', render: (m) => formatDateKST(m.joinedAt) },
    {
      key: 'actions', label: '관리', hideLabel: true, align: 'right',
      render: (m) => {
        if (!canManage) return null;
        async function doRemove() {
          'use server';
          return toActionState(await removeWorkspaceMemberAction(workspaceId, m.userId), '멤버를 제외했습니다.');
        }
        return (
          <>
            <ConfirmButton
              action={doRemove}
              label="제외"
              confirmMessage="이 멤버를 제외하시겠습니까?"
              confirmLabel="제외"
              labelClassName="text-label-small text-error hover:underline disabled:opacity-40 disabled:cursor-not-allowed"
              confirmClassName="text-label-small text-error hover:underline"
              disabled={m.isLastAdmin}
            />
            {m.isLastAdmin && <span className="ml-2 text-label-small text-on-surface-variant">마지막 관리자는 제외할 수 없습니다.</span>}
          </>
        );
      },
    },
  ];
  return <AdminDataTable caption="멤버 목록" rows={members} columns={columns} getKey={(m) => m.userId} emptyMessage="멤버 없음" hoverRows={false} />;
}
