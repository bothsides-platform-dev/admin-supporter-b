import Link from 'next/link';
import { notFound } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { AdminPageHeader } from '@/components/AdminPageHeader';
import { ActionForm } from '@/components/ActionForm';
import { SubmitButton } from '@/components/SubmitButton';
import { actionSuccess, actionFailure, toActionState, type ActionState } from '@/lib/action-state';
import { requireAdminPermission } from '@/lib/auth/admin-session';
import { hasPermission } from '@/lib/auth/permissions';
import { actionDb } from '@/lib/server/actions/auth/_shared';
import { rfps } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

import {
  checkReminderReceipt,
  enqueueReminders,
  reminderHistory,
  reminderPreview,
} from '@/lib/server/services/rfpReminders';
import { formatKST, isUuid } from '@/lib/utils';

export const metadata = { title: '견적 마감 안내' };
const EVENTS: Record<string, string> = {
  queued: '공급자 대기',
  scheduled: '공급자 예약',
  sent: '공급자 발송',
  delivered: '수신 메일 서버 전달',
  bounced: '반송',
  failed: '공급자 발송 실패',
  canceled: '발송 취소',
  complained: '스팸 신고',
  delivery_delayed: '전달 지연',
  opened: '메일 열람 기록',
  clicked: '메일 링크 클릭 기록',
  suppressed: '발송 제외',
};
function status(row: Awaited<ReturnType<typeof reminderHistory>>[number]) {
  if (row.event) return EVENTS[row.event] ?? '공급자 결과 확인 필요';
  if (row.messageId) return '공급자 접수 · 전달 결과 미확인';
  if (row.status === 'failed') return '발송 처리 실패 · 공급자 결과 확인 필요';
  if (row.status === 'sent') return '발송 처리 기록 있음 · 공급자 접수 미확인';
  return row.attempts ? '재시도 대기 · 공급자 접수 미확인' : '발송 대기';
}

export default async function RemindersPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdminPermission('data.view');
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const [rfp] = await actionDb().select({ code: rfps.code }).from(rfps).where(eq(rfps.id, id));
  if (!rfp) notFound();
  const canSend = hasPermission(session, 'reminders.send');
  const [targets, history] = await Promise.all([canSend ? reminderPreview(id) : [], reminderHistory(id)]);
  const booked = new Set(history.map((h) => h.key));
  const available = targets.filter((t) => !booked.has(t.key));
  async function queue(_prev: ActionState, form: FormData): Promise<ActionState> {
    'use server';
    const result = await enqueueReminders(
      id,
      form.getAll('target').map(String),
      String(form.get('reason') ?? ''),
    );
    if (!result.ok) return actionFailure(result.error);
    revalidatePath(`/rfps/${id}/reminders`);
    return actionSuccess(`새로 예약 ${result.queued}건 · 기존 예약 ${result.existing}건`);
  }
  async function refresh(_prev: ActionState, form: FormData): Promise<ActionState> {
    'use server';
    const result = await checkReminderReceipt(id, String(form.get('entry') ?? ''));
    if (result.ok) revalidatePath(`/rfps/${id}/reminders`);
    return toActionState(result, '공급자 결과를 확인했습니다.');
  }
  return (
    <div className="max-w-4xl space-y-5">
      <AdminPageHeader title="견적 마감 안내" breadcrumbs={[{ label: rfp.code, href: `/rfps/${id}` }]} />
      {canSend && (
        <section className="space-y-3 rounded border border-outline-variant p-4">
          <h2 className="font-medium">이메일 수신 대상 {available.length}명</h2>
          {available.length ? (
            <ActionForm action={queue} className="space-y-3 text-body-small">
              <p>선택한 담당자에게 RFP 코드, 견적 회차, 마감 시각과 해당 PG의 견적 요청 링크를 보냅니다.</p>
              <fieldset className="divide-y divide-outline-variant">
                <legend className="sr-only">수신자 선택</legend>
                {available.map((t) => (
                  <label key={t.token} className="flex items-start gap-2 py-2">
                    <input type="checkbox" name="target" value={t.token} />
                    <span>
                      {t.pg} · {t.email}
                      <br />
                      {t.round}차 견적 마감 {formatKST(t.deadline)}
                    </span>
                  </label>
                ))}
              </fieldset>
              <label className="block">
                발송 사유 (내부 기록)
                <input
                  className="block w-full rounded border border-outline-variant bg-surface p-2"
                  name="reason"
                  required
                  maxLength={500}
                />
              </label>
              <SubmitButton className="rounded bg-primary px-4 py-2 text-on-primary">
                선택한 수신자에게 발송 예약
              </SubmitButton>
            </ActionForm>
          ) : (
            <p className="text-body-small">
              새로 안내할 수신자가 없습니다.{' '}
              <Link href={`/rfps/${id}#consultations`} className="text-primary">
                PG 상담 배정·마감 안내 이력 보기
              </Link>
            </p>
          )}
        </section>
      )}
      <section className="space-y-2">
        <h2 className="font-medium">예약 및 발송 결과</h2>
        {history.length ? (
          <ul className="divide-y divide-outline-variant rounded border border-outline-variant">
            {history.map((h) => (
              <li key={h.id} className="space-y-1 p-3 text-body-small">
                <strong>{h.pg ?? 'PG 기록 없음'}</strong> {canSend && <> · {h.email}</>} · {status(h)}
                <p>
                  처리 예약 {formatKST(h.scheduledAt)}
                  {h.checkedAt && <> · 공급자 조회 {formatKST(h.checkedAt)}</>}
                </p>
                <Link href={`/tasks?rfp=${id}&target=delivery:${h.id}`} className="text-primary">
                  이 발송 건의 후속 업무
                </Link>
                {canSend && h.messageId && (
                  <ActionForm action={refresh}>
                    <input name="entry" type="hidden" value={h.id} />
                    <SubmitButton className="text-primary">공급자 결과 확인</SubmitButton>
                  </ActionForm>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-body-small">이 RFP의 마감 안내 예약 기록이 없습니다.</p>
        )}
        <Link className="inline-block text-body-small text-primary" href={`/tasks?rfp=${id}`}>
          발송 예외 후속 업무
        </Link>
      </section>
    </div>
  );
}
