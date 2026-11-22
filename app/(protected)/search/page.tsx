import Link from 'next/link';
import { AdminPageHeader } from '@/components/AdminPageHeader';
import { searchCustomers, SEARCH_GROUPS, SEARCH_LIMIT } from '@/lib/server/queries/admin/customerSearch';

export const metadata = { title: '고객 검색' };
export default async function CustomerSearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const raw = (await searchParams).q;
  const q = typeof raw === 'string' ? raw.trim().slice(0, 160) : '';
  const hits = await searchCustomers(q);
  const returnTo = '/search?' + new URLSearchParams({ q });
  return (
    <div className="space-y-5">
      <AdminPageHeader title="고객 검색" />
      <form action="/search" className="flex flex-wrap items-end gap-2 text-body-small">
        <label className="grid w-full max-w-md gap-1">
          회사명, 사업자번호, 회원 이메일 또는 RFP 코드
          <input
            type="search"
            name="q"
            defaultValue={q}
            maxLength={160}
            required
            className="rounded border border-outline-variant bg-surface px-3 py-2"
          />
        </label>
        <button className="rounded bg-primary px-4 py-2 text-on-primary">검색</button>
      </form>
      {q && !hits.length && <p>‘{q}’에 해당하는 결과가 없습니다.</p>}
      {Object.entries(SEARCH_GROUPS).map(([key, label]) => {
        const rows = hits.filter((h) => h.type === key);
        if (!rows.length) return null;
        return (
          <section key={key} className="space-y-2">
            <h2 className="font-medium">
              {label} {rows[0].total}건
            </h2>
            {rows[0].total > SEARCH_LIMIT && (
              <p className="text-body-small">
                상위 {SEARCH_LIMIT}건 표시 · 검색어를 더 입력해 범위를 좁힐 수 있습니다.
              </p>
            )}
            <ul className="divide-y divide-outline-variant rounded border border-outline-variant">
              {rows.map((row) => (
                <li key={row.id}>
                  <Link
                    className="flex flex-wrap justify-between gap-2 p-3 text-body-small hover:bg-surface-container-low"
                    href={`/${row.type}/${row.id}?returnTo=${encodeURIComponent(returnTo)}`}
                  >
                    <strong>{row.name}</strong>
                    <span>{row.detail || row.id}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
