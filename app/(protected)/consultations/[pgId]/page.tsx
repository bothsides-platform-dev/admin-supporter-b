import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { requireAdminPermission } from '@/lib/auth/admin-session';
import { hasPermission } from '@/lib/auth/permissions';
import { actionDb } from '@/lib/server/actions/auth/_shared';
import { sendCorrection, setAssignmentPolicy } from '@/lib/server/actions/admin/consultations';
import {
  activeMembers,
  companies,
  correctionDraft,
  corrections,
  formatTime,
  groups,
  policyFor,
} from '@/lib/server/consultations/queries';
import { ConsultationRoster } from '@/components/ConsultationRoster';
import { ActionForm } from '@/components/ActionForm';
import { SubmitButton } from '@/components/SubmitButton';

export default async function PolicyPage({ params }: { params: Promise<{ pgId: string }> }) {
  const session = await requireAdminPermission('data.view');
  const { pgId } = await params;
  if (!z.uuid().safeParse(pgId).success) notFound();
  const db = actionDb();
  const [pgs, policy, members, industries, draft, history] = await Promise.all([
    companies(db),
    policyFor(db, pgId),
    activeMembers(db, pgId),
    groups(db),
    correctionDraft(db, pgId),
    corrections(db, pgId),
  ]);
  const company = pgs.find((p) => p.id === pgId);
  if (!company) notFound();
  const edit = hasPermission(session, 'rfp.manage');
  return (
    <main className="space-y-8">
      <Link className="underline" href="/consultations">
        상담 목록
      </Link>
      <h1 className="text-headline-medium">{company.name} 상담 운영</h1>
      <section className="space-y-3">
        <h2 className="text-title-large">시정 요청</h2>
        {draft ? (
          <>
            <p>
              수신 책임자 {draft.manager.name} ({draft.manager.email})
            </p>
            <pre className="whitespace-pre-wrap rounded border p-4 font-sans">{draft.body}</pre>
            {edit && (
              <ActionForm action={sendCorrection.bind(null, pgId, draft.fingerprint)}>
                <SubmitButton className="rounded bg-primary px-3 py-2 text-on-primary">
                  내용 확인 후 책임자에게 발송
                </SubmitButton>
              </ActionForm>
            )}
          </>
        ) : (
          <p>
            현재 발송할 시정 요청이 없습니다. 승인된 책임자와 합의한 기간·건수를 충족한 확정 지연 건이
            있어야 합니다.
          </p>
        )}
        {history.map((n) => (
          <details key={n.id}>
            <summary>
              {formatTime(n.confirmed_at)} · {n.manager} ·{' '}
              {n.status === 'sent' && !n.last_error
                ? '발송 완료'
                : n.status === 'pending'
                  ? '발송 대기'
                  : '발송 보류 또는 실패'}
            </summary>
            <p>
              발송 확정 {n.confirmed_by}
              {n.sent_at && ' · 발송 처리 ' + formatTime(n.sent_at)}
            </p>
            <pre className="whitespace-pre-wrap font-sans">{n.body}</pre>
          </details>
        ))}
      </section>
      <section className="space-y-3">
        <h2 className="text-title-large">합의한 배정 기준</h2>
        <ActionForm action={setAssignmentPolicy.bind(null, pgId)}>
          <fieldset disabled={!edit} className="space-y-4">
            <label className="block">
              <input type="checkbox" name="enabled" defaultChecked={policy?.enabled} /> 이 PG에 자동
              배정
            </label>
            <label className="block">
              <input type="checkbox" name="alimtalkReady" defaultChecked={policy?.alimtalk_ready} />{' '}
              템플릿 승인과 단말 수신 확인 완료 · 수신 동의한 담당자에게 알림톡 발송
            </label>
            <div className="flex flex-wrap gap-4">
              <label>
                첫 연락 기한(영업일){' '}
                <input
                  className="w-20 border"
                  type="number"
                  min="1"
                  max="30"
                  required
                  name="contactDays"
                  defaultValue={policy?.contact_days}
                />
              </label>
              <label>
                지연 집계 기간(일){' '}
                <input
                  className="w-20 border"
                  type="number"
                  min="1"
                  required
                  name="windowDays"
                  defaultValue={policy?.window_days}
                />
              </label>
              <label>
                시정 요청 기준(건){' '}
                <input
                  className="w-20 border"
                  type="number"
                  min="1"
                  required
                  name="threshold"
                  defaultValue={policy?.threshold}
                />
              </label>
            </div>
            <label className="block">
              시정 요청 수신 책임자{' '}
              <select name="managerId" required defaultValue={policy?.manager_id ?? ''}>
                <option value="">책임자 선택</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.email})
                  </option>
                ))}
              </select>
            </label>
            <ConsultationRoster initial={policy?.roster ?? []} members={members} groups={industries} />
            {edit && (
              <SubmitButton className="rounded bg-primary px-3 py-2 text-on-primary">
                배정 기준 저장
              </SubmitButton>
            )}
          </fieldset>
        </ActionForm>
      </section>
    </main>
  );
}
