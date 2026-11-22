import Link from 'next/link';
import { actionDb } from '@/lib/server/actions/auth/_shared';
import { judgeContact, setAssignee } from '@/lib/server/actions/admin/consultations';
import {
  activeMembers,
  caseHistory,
  formatTime,
  requestCases,
  type CaseRow,
} from '@/lib/server/consultations/queries';
import { ActionForm } from './ActionForm';
import { SubmitButton } from './SubmitButton';

function eventName(key: string) {
  if (key.startsWith('assignment-')) return '담당자 배정';
  if (key.startsWith('remind-')) return '수신 확인 재안내';
  if (key === 'late-contact') return '첫 연락 기한 경과';
  if (key === 'late-quote') return '견적 마감 경과';
  return '견적 제출 안내';
}
async function Review({ c, canManage }: { c: CaseRow; canManage: boolean }) {
  const db = actionDb();
  const [{ questions, events, evidence }, members] = await Promise.all([
    caseHistory(db, c.review_id),
    canManage && c.active ? activeMembers(db, c.pg_id) : [],
  ]);
  return (
    <article className="space-y-3 rounded border border-outline-variant p-4">
      <h3 className="text-title-medium">
        <Link className="underline" href={'/consultations/' + c.pg_id}>
          {c.pg_name}
        </Link>{' '}
        · {c.assignee_name ?? '미배정'}
      </h3>
      <p>
        첫 연락 {formatTime(c.first_contact_at)} (기한 {formatTime(c.contact_due)})<br />
        견적 제출 {formatTime(c.quoted_at)} (마감 {formatTime(c.quote_due)})
      </p>
      <details>
        <summary>연락처 제공 동의와 배정 이력</summary>
        <p>
          {formatTime(c.consent_at)} · {c.consent_text}
        </p>
        <ul>
          {events.map((e) => (
            <li key={e.key}>
              {formatTime(e.at)} · {eventName(e.key)} {e.detail}
            </li>
          ))}
        </ul>
      </details>
      {canManage && c.active && (
        <ActionForm action={setAssignee.bind(null, c.review_id)} className="flex flex-wrap gap-2">
          <input type="hidden" name="revision" value={c.revision} />
          <select name="assignee" aria-label="새 담당자" defaultValue="" required>
            <option value="">새 담당자 선택</option>
            {members
              .filter((m) => m.id !== c.assignee)
              .map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.email})
                </option>
              ))}
          </select>
          <input
            className="border px-2"
            name="reason"
            aria-label="배정 사유"
            placeholder="배정 사유"
            maxLength={2000}
            required
          />
          <SubmitButton>담당자 배정</SubmitButton>
        </ActionForm>
      )}
      {questions.map((q) => (
        <div className="space-y-1 border-t pt-2" key={q.id}>
          <p>
            {formatTime(q.reported_at)} · {q.reporter} 연락 기록
          </p>
          <p>
            {q.answer
              ? formatTime(q.answered_at) +
                ' · ' +
                (q.answer === 'received' ? '받았어요' : '못 받았어요') +
                ' (' +
                (q.channel === 'email' ? '이메일' : '앱') +
                ')'
              : '작성자 응답 대기'}
          </p>
          {q.judgment && (
            <p>
              {q.judgment === 'accepted' ? '연락 인정' : '연락 없음'} · {q.reason} · {q.judged_by} ·{' '}
              {formatTime(q.judged_at)}
            </p>
          )}
          {canManage && q.answer === 'missed' && !q.judgment && (
            <ActionForm
              action={judgeContact.bind(null, c.review_id, q.id)}
              className="flex flex-wrap gap-2"
            >
              <select name="judgment" aria-label="첫 연락 판정" defaultValue="" required>
                <option value="">판정 선택</option>
                <option value="accepted">연락 인정</option>
                <option value="absent">연락 없음</option>
              </select>
              <input
                name="reason"
                aria-label="판정 근거"
                placeholder="판정 근거"
                required
                maxLength={2000}
                className="border px-2"
              />
              <SubmitButton>판정 기록</SubmitButton>
            </ActionForm>
          )}
        </div>
      ))}
      {evidence.length > 0 && (
        <ul>
          {evidence.map((e, i) => (
            <li key={i}>
              {formatTime(e.at)} · {e.detail} ·{' '}
              {e.key.startsWith('read-') ? '첫 연락 읽음' : '첫 연락에 답장'}
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
export async function ConsultationHistory({ rfpId, canManage }: { rfpId: string; canManage: boolean }) {
  const cases = await requestCases(actionDb(), rfpId);
  if (!cases.length) return null;
  return (
    <section id="consultations" className="space-y-3">
      <h2 className="text-title-large">PG 상담 이력</h2>
      {cases.map((c) => (
        <Review key={c.review_id} c={c} canManage={canManage} />
      ))}
    </section>
  );
}
