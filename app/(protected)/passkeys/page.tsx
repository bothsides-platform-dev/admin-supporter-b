import { headers } from 'next/headers';

import { AdminDataTable, type AdminTableColumn } from '@/components/AdminDataTable';
import { ConfirmButton } from '@/components/ConfirmButton';
import { toActionState, type ActionState } from '@/lib/action-state';
import { requireAdminSession } from '@/lib/auth/admin-session';
import { MAX_PASSKEYS_PER_ADMIN } from '@/lib/auth/passkey-limits';
import { listPasskeys, passkeyUserId, relyingParty, type PasskeyListRow } from '@/lib/auth/passkeys';
import { removePasskeyAction } from '@/lib/server/actions/admin/passkeys';
import { actionDb } from '@/lib/server/actions/auth/_shared';
import { formatDateKST, formatKST } from '@/lib/utils';
import { PasskeyProviderSync } from './PasskeyProviderSync';
import { PasskeyRegistration } from './PasskeyRegistration';

const dangerButton = 'rounded border border-error text-error px-3 py-1.5 text-label-small hover:bg-error/10';
const muted = 'md-numeric text-label-small text-on-surface-variant';

function PasskeyRowActions({ row }: { row: PasskeyListRow }) {
  async function doRemove(): Promise<ActionState> {
    'use server';
    return toActionState(await removePasskeyAction(row.id), '패스키를 삭제했습니다.');
  }
  return (
    <div className="flex justify-end">
      <ConfirmButton
        action={doRemove}
        label="삭제"
        confirmMessage={`‘${row.label}’ 패스키를 삭제할까요?`}
        confirmLabel="삭제"
        labelClassName={dangerButton}
        confirmClassName={dangerButton}
      />
    </div>
  );
}

const columns: AdminTableColumn<PasskeyListRow>[] = [
  { key: 'label', label: '기기 이름', render: (row) => <span className="break-all">{row.label}</span> },
  { key: 'createdAt', label: '등록일', render: (row) => <span className={muted}>{formatDateKST(row.createdAt)}</span> },
  {
    key: 'lastUsedAt',
    label: '마지막 사용',
    render: (row) => <span className={muted}>{row.lastUsedAt ? formatKST(row.lastUsedAt) : '아직 사용 안 함'}</span>,
  },
  {
    key: 'storage',
    label: '저장 방식',
    render: (row) => <span className="text-label-small text-on-surface-variant">{row.backupEligible ? '여러 기기 동기화' : '이 기기 전용'}</span>,
  },
  { key: 'actions', label: '관리', align: 'right', render: (row) => <PasskeyRowActions row={row} /> },
];

/** Every admin manages their own passkeys here; nobody else's are visible. */
export default async function PasskeysPage() {
  const session = await requireAdminSession();
  const passkeys = await listPasskeys(actionDb(), session.adminUserId);
  const relying = relyingParty((await headers()).get('host'));
  const full = passkeys.length >= MAX_PASSKEYS_PER_ADMIN;

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="space-y-1">
        <h1 className="text-headline-small font-semibold">내 패스키</h1>
        <p className="text-body-small text-on-surface-variant">
          패스키를 등록하면 로그인할 때 인증 앱 코드 대신 이 기기의 지문, 얼굴 인식 또는 기기 잠금으로 2단계 인증을 통과할 수 있습니다.
          인증 앱 등록은 그대로 유지되므로 코드로도 계속 인증할 수 있습니다.
        </p>
      </div>

      <section className="space-y-2">
        <h2 className="text-title-small font-semibold">패스키 등록</h2>
        {!relying ? (
          <p className="text-body-small text-on-surface-variant">이 환경에서는 패스키를 사용할 수 없습니다.</p>
        ) : full ? (
          <p className="text-body-small text-on-surface-variant">
            패스키는 {MAX_PASSKEYS_PER_ADMIN}개까지 등록할 수 있습니다. 쓰지 않는 패스키를 삭제한 뒤 등록해 주세요.
          </p>
        ) : (
          <>
            <p className="text-body-small text-on-surface-variant">
              본인 확인을 위해 인증 앱의 현재 6자리 코드가 필요합니다. 방금 로그인에 쓴 코드는 다시 쓸 수 없으니 새 코드가 표시되면 입력해 주세요.
            </p>
            <PasskeyRegistration />
          </>
        )}
      </section>

      <AdminDataTable
        caption="등록된 패스키 목록"
        rows={passkeys}
        columns={columns}
        getKey={(row) => row.id}
        emptyMessage="등록된 패스키가 없습니다."
      />
      <p className="text-body-small text-on-surface-variant">
        잃어버렸거나 더 쓰지 않는 기기의 패스키는 삭제해 주세요. 로그인할 수 없다면 다른 관리자에게 2단계 인증 초기화를 요청하면 됩니다.
        초기화하면 인증 앱 등록과 패스키가 모두 삭제됩니다.
      </p>

      {relying && (
        <PasskeyProviderSync
          rpId={relying.rpID}
          userId={passkeyUserId(session.adminUserId)}
          credentialIds={passkeys.map((row) => row.credentialId)}
        />
      )}
    </div>
  );
}
