import { AdminPageHeader } from '@/components/AdminPageHeader';
import { ActionForm } from '@/components/ActionForm';
import { AdminDataTable, type AdminTableColumn } from '@/components/AdminDataTable';
import { ConfirmButton } from '@/components/ConfirmButton';
import { SubmitButton } from '@/components/SubmitButton';
import { Chip } from '@/components/primitives/Chip';
import { toActionState, type ActionState } from '@/lib/action-state';
import { requireAdminPermission } from '@/lib/auth/admin-session';
import { listAdminUsers, type AdminUserListRow } from '@/lib/auth/admin-users';
import {
  addAdminUserAction,
  removeAdminUserAction,
  resetAdminTotpAction,
} from '@/lib/server/actions/admin/adminUsers';
import { actionDb } from '@/lib/server/actions/auth/_shared';
import { formatDateKST } from '@/lib/utils';

const dangerButton = 'rounded border border-error text-error px-3 py-1.5 text-label-small hover:bg-error/10';
const neutralButton = 'rounded border border-outline-variant px-3 py-1.5 text-label-small text-on-surface-variant hover:bg-surface-container-highest';

function AdminRowActions({ row }: { row: AdminUserListRow }) {
  async function doReset(): Promise<ActionState> {
    'use server';
    return toActionState(await resetAdminTotpAction(row.id), '2단계 인증을 초기화했습니다. 다음 로그인 때 다시 등록합니다.');
  }
  async function doRemove(): Promise<ActionState> {
    'use server';
    return toActionState(await removeAdminUserAction(row.id), '관리자를 삭제했습니다.');
  }
  return (
    <div className="flex flex-wrap justify-end gap-2">
      <ConfirmButton
        action={doReset}
        label="2단계 인증 초기화"
        confirmMessage={`${row.email}의 2단계 인증을 초기화할까요?`}
        confirmLabel="초기화"
        labelClassName={neutralButton}
        confirmClassName={dangerButton}
      />
      <ConfirmButton
        action={doRemove}
        label="삭제"
        confirmMessage={`${row.email}을(를) 관리자에서 삭제할까요?`}
        confirmLabel="삭제"
        labelClassName={dangerButton}
        confirmClassName={dangerButton}
      />
    </div>
  );
}

export const metadata = { title: '관리자 계정' };

export default async function AdminsPage() {
  const session = await requireAdminPermission('admin.manage');
  const rows = await listAdminUsers(actionDb());

  async function doAdd(_previous: ActionState, formData: FormData): Promise<ActionState> {
    'use server';
    return toActionState(
      await addAdminUserAction(String(formData.get('email') ?? '')),
      '관리자를 추가했습니다. 해당 계정으로 처음 로그인할 때 2단계 인증을 등록합니다.',
    );
  }

  const columns: AdminTableColumn<AdminUserListRow>[] = [
    {
      key: 'email',
      label: '이메일',
      render: (row) => (
        <span className="break-all">
          {row.email}
          {row.id === session.adminUserId && <span className="ml-2 text-label-small text-on-surface-variant">(나)</span>}
        </span>
      ),
    },
    {
      key: 'totp',
      label: '2단계 인증',
      render: (row) => row.totpEnabledAt
        ? <span className="md-numeric text-label-small text-on-surface-variant">{formatDateKST(row.totpEnabledAt)} 등록</span>
        : <Chip color="warning" label="미등록" />,
    },
    {
      key: 'createdAt',
      label: '추가일',
      render: (row) => <span className="md-numeric text-label-small text-on-surface-variant">{formatDateKST(row.createdAt)}</span>,
    },
    {
      key: 'createdBy',
      label: '추가한 사람',
      render: (row) => <span className="text-label-small text-on-surface-variant break-all">{row.createdBy ?? '—'}</span>,
    },
    {
      key: 'actions',
      label: '관리',
      align: 'right',
      render: (row) => row.id === session.adminUserId ? null : <AdminRowActions row={row} />,
    },
  ];

  return (
    <div className="space-y-6 max-w-5xl">
      <AdminPageHeader
        title="관리자 계정"
        description="여기 등록된 Google 계정만 어드민에 로그인할 수 있고, 로그인할 때마다 인증 앱의 2단계 인증 코드가 필요합니다. 2단계 인증 미등록 계정은 처음 로그인하는 사람이 등록하므로, 추가한 뒤 바로 등록하도록 안내해 주세요."
      />

      <section className="space-y-2">
        <h2 className="text-title-small font-semibold">관리자 추가</h2>
        <ActionForm action={doAdd} className="flex flex-wrap items-start gap-2">
          <input
            name="email"
            type="email"
            required
            aria-label="추가할 관리자 Google 이메일"
            placeholder="name@example.com"
            autoComplete="off"
            className="w-72 max-w-full rounded border border-outline-variant bg-surface px-3 py-1.5 text-body-small focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <SubmitButton className="rounded border border-primary text-primary px-4 py-1.5 text-label-small hover:bg-primary/10">
            추가
          </SubmitButton>
        </ActionForm>
      </section>

      <AdminDataTable
        caption="관리자 계정 목록"
        rows={rows}
        columns={columns}
        getKey={(row) => row.id}
        emptyMessage="등록된 관리자가 없습니다."
      />
      <p className="text-body-small text-on-surface-variant">
        본인 계정의 삭제와 2단계 인증 초기화는 다른 관리자가 처리합니다.
      </p>
    </div>
  );
}
