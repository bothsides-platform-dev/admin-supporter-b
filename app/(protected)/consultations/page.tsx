import Link from 'next/link';
import { requireAdminPermission } from '@/lib/auth/admin-session';
import { actionDb } from '@/lib/server/actions/auth/_shared';
import { companies, formatTime, operationsQueue } from '@/lib/server/consultations/queries';

export const metadata = { title: 'PG 상담 배정·지연' };
export default async function ConsultationsPage() {
  await requireAdminPermission('data.view');
  const db = actionDb();
  const [cases, pgs] = await Promise.all([operationsQueue(db), companies(db)]);
  return (
    <main className="space-y-8">
      <h1 className="text-headline-medium">PG 상담 배정·지연</h1>
      <section className="space-y-3">
        <h2 className="text-title-large">처리가 필요한 상담</h2>
        {!cases.length ? (
          <p>미배정, 미수신 판정 대기 또는 기한이 지난 상담이 없습니다.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-body-small">
              <thead>
                <tr>
                  {['견적번호', 'PG사', '담당자', '확인할 내용', '첫 연락 기한', '견적 마감'].map(
                    (h) => (
                      <th key={h} className="p-2">
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {cases.map((c) => (
                  <tr key={c.review_id} className="border-t border-outline-variant">
                    <td className="p-2">
                      <Link className="underline" href={'/rfps/' + c.rfp_id + '#consultations'}>
                        {c.code}
                      </Link>
                    </td>
                    <td>
                      <Link className="underline" href={'/consultations/' + c.pg_id}>
                        {c.pg_name}
                      </Link>
                    </td>
                    <td>{c.assignee_name ?? '미배정'}</td>
                    <td>
                      {[
                        !c.assignee && c.active && '담당자 배정',
                        c.disputed && '미수신 판정 대기',
                        c.contact_late && '첫 연락 지연',
                        c.quote_late && '견적 지연',
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </td>
                    <td>{formatTime(c.contact_due)}</td>
                    <td>{formatTime(c.quote_due)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section className="space-y-3">
        <h2 className="text-title-large">PG별 배정 기준과 시정 요청</h2>
        <ul className="space-y-2">
          {pgs.map((pg) => (
            <li key={pg.id}>
              <Link className="underline" href={'/consultations/' + pg.id}>
                {pg.name}
              </Link>{' '}
              · {pg.enabled ? '배정 운영 중' : '배정 미운영'}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
