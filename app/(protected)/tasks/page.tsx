import { randomUUID } from 'node:crypto';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AdminPageHeader } from '@/components/AdminPageHeader';
import { AdminListPagination } from '@/components/AdminListPagination';
import { AdminViewTabs } from '@/components/AdminViewTabs';
import { ActionForm } from '@/components/ActionForm';
import { SubmitButton } from '@/components/SubmitButton';
import { requireAdminPermission } from '@/lib/auth/admin-session';
import { hasPermission } from '@/lib/auth/permissions';
import {
  TASK_CATEGORIES,
  TASK_VIEWS,
  tasksHref,
  toKstInput,
  validChannelUrl,
  type TaskCategory,
  type TaskParams,
} from '@/lib/followups';
import { saveFollowupAction } from '@/lib/server/actions/admin/followups';
import { getTaskContext, getTaskOwners, listFollowups } from '@/lib/server/queries/admin/followups';
import { formatKST } from '@/lib/utils';

export const metadata = { title: '후속 업무' };
const field = 'block w-full rounded border border-outline-variant bg-surface px-3 py-2';
const primary = 'rounded bg-primary px-3 py-2 text-on-primary';
const secondary = 'rounded border border-outline px-3 py-2';

function OwnerSelect({ owners, value }: { owners: { id: string; email: string }[]; value?: string | null }) {
  return (
    <label>
      내부 담당자
      <select name="owner" className={field} defaultValue={value ?? ''}>
        <option value="">미배정</option>
        {owners.map((o) => (
          <option key={o.id} value={o.id}>
            {o.email}
          </option>
        ))}
      </select>
    </label>
  );
}

export default async function FollowupsPage({ searchParams }: { searchParams: Promise<TaskParams> }) {
  const session = await requireAdminPermission('data.view');
  const canWrite = hasPermission(session, 'tasks.write');
  const params = await searchParams;
  const [context, result, owners] = await Promise.all([
    getTaskContext(params),
    listFollowups(params),
    canWrite ? getTaskOwners() : [],
  ]);
  if (!context) notFound();
  const scoped = Boolean(context.workspaceId || context.rfpId);
  const target = context.rounds.find((r) => r.key === params.target);
  const category = target?.key.startsWith('delivery:')
    ? 'delivery'
    : target?.key.startsWith('signing:')
      ? 'signing'
      : target?.key.startsWith('bid:')
        ? 'terms'
        : 'contact';
  return (
    <div className="space-y-5">
      <AdminPageHeader
        title="후속 업무"
        meta={
          scoped && (
            <>
              {context.label}{' '}
              <Link href="/tasks" className="text-primary">
                전체 업무
              </Link>
            </>
          )
        }
      />
      <AdminViewTabs
        label="업무 상태"
        tabs={Object.entries(TASK_VIEWS).map(([key, label]) => ({
          label,
          href: tasksHref({ ...params, view: key, page: undefined }),
          active: result.view === key,
        }))}
      />
      {canWrite && (
        <details
          open={target ? true : undefined}
          className="rounded border border-outline-variant p-4 text-body-small"
        >
          <summary className="cursor-pointer font-medium">업무 등록</summary>
          <ActionForm action={saveFollowupAction} className="mt-3 grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="mode" value="create" />
            <input type="hidden" name="id" value={randomUUID()} />
            <input type="hidden" name="workspace" value={context.workspaceId} />
            <input type="hidden" name="rfp" value={context.rfpId} />
            <label>
              할 일<input className={field} name="title" required maxLength={180} />
            </label>
            <label>
              업무 유형
              <select className={field} name="category" defaultValue={category}>
                {Object.entries(TASK_CATEGORIES).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            {scoped ? (
              <label>
                연결 대상
                <select className={field} name="round" defaultValue={target?.key ?? ''}>
                  <option value="">{context.label}</option>
                  {context.rounds.map((r) => (
                    <option key={r.key} value={r.key}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <label>
                RFP 코드 (선택)
                <input className={field} name="code" placeholder="가입 전 문의는 비워 두세요" />
              </label>
            )}
            <OwnerSelect owners={owners} />
            <label>
              다음 연락 시각 (한국시간)
              <input type="datetime-local" name="due" className={field} required />
            </label>
            <label>
              채널톡 상담 링크 (선택)
              <input type="url" name="channel" className={field} />
            </label>
            <label className="sm:col-span-2">
              최근 연락 내용 (선택)
              <textarea name="note" className={field} maxLength={2000} />
            </label>
            <div>
              <SubmitButton className={primary}>업무 등록</SubmitButton>
            </div>
          </ActionForm>
        </details>
      )}
      {result.rows.length ? (
        <ul className="divide-y divide-outline-variant rounded border border-outline-variant">
          {result.rows.map((row) => {
            const t = row.task;
            return (
              <li key={t.id} className="space-y-2 p-4 text-body-small">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="text-title-small font-medium">{t.title}</h2>
                  <span>{TASK_CATEGORIES[t.category as TaskCategory]}</span>
                </div>
                <p>
                  {row.company ?? '미연결 문의'}{' '}
                  {row.code && (
                    <Link className="text-primary" href={`/rfps/${t.rfpId}`}>
                      {row.code}
                    </Link>
                  )}{' '}
                  {row.roundLabel && <> · {row.roundLabel}</>}
                </p>
                <p>
                  내부 담당자 · {row.owner ?? '미배정'}　
                  {t.completedAt ? `완료 · ${formatKST(t.completedAt)}` : `다음 연락 · ${formatKST(t.dueAt)}`}
                </p>
                {row.note && row.noteAt && (
                  <p className="whitespace-pre-wrap">
                    최근 기록 · {row.note}{' '}
                    <span className="text-on-surface-variant">
                      ({row.noteActor}, {formatKST(row.noteAt)})
                    </span>
                  </p>
                )}
                <div className="flex gap-3">
                  <Link href={`/tasks/${t.id}`} className="text-primary">
                    연락·처리 기록
                  </Link>
                  {t.channelUrl && validChannelUrl(t.channelUrl) && (
                    <a href={t.channelUrl} target="_blank" rel="noreferrer" className="text-primary">
                      채널톡 상담 열기
                    </a>
                  )}
                </div>
                {canWrite && !t.completedAt && (
                  <details>
                    <summary className="cursor-pointer text-primary">기록·인계·완료</summary>
                    <ActionForm action={saveFollowupAction} className="mt-2 grid gap-3 sm:grid-cols-2">
                      <input type="hidden" name="id" value={t.id} />
                      <input type="hidden" name="version" value={t.version} />
                      <OwnerSelect owners={owners} value={t.ownerId} />
                      <label>
                        다음 연락 시각 (한국시간)
                        <input
                          className={field}
                          type="datetime-local"
                          name="due"
                          defaultValue={toKstInput(t.dueAt)}
                          required
                        />
                      </label>
                      <label>
                        채널톡 상담 링크
                        <input
                          className={field}
                          type="url"
                          name="channel"
                          defaultValue={t.channelUrl ?? ''}
                        />
                      </label>
                      <label>
                        연락·처리 결과 (완료 시 필수)
                        <textarea className={field} name="note" maxLength={2000} />
                      </label>
                      <div className="flex gap-2">
                        <SubmitButton className={primary} name="mode" value="update">
                          변경 저장
                        </SubmitButton>
                        <SubmitButton className={secondary} name="mode" value="complete">
                          완료 처리
                        </SubmitButton>
                      </div>
                    </ActionForm>
                    {!t.rfpId && (
                      <ActionForm action={saveFollowupAction} className="mt-4 flex flex-wrap items-end gap-2">
                        <input type="hidden" name="id" value={t.id} />
                        <input type="hidden" name="version" value={t.version} />
                        <input type="hidden" name="mode" value="link" />
                        <label>
                          RFP 코드
                          <input name="code" className={field} />
                        </label>
                        {!t.workspaceId && (
                          <label>
                            또는 회사 ID
                            <input name="workspace" className={field} />
                          </label>
                        )}
                        <SubmitButton className={secondary}>대상 연결</SubmitButton>
                      </ActionForm>
                    )}
                  </details>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="rounded border border-outline-variant p-4 text-body-small">
          이 목록에 해당하는 업무가 없습니다.
        </p>
      )}
      <AdminListPagination
        path="/tasks"
        page={result.page}
        total={result.total}
        hrefFor={(page) => tasksHref({ ...params, page: String(page) })}
      />
    </div>
  );
}
