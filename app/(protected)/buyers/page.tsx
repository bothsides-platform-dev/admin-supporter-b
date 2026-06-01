import { listBuyers } from '@/lib/server/queries/admin/buyers';
import Link from 'next/link';
import { AdminStatusBadge } from '@/components/AdminStatusBadge';

export default async function BuyersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const { q, status } = await searchParams;
  const buyers = await listBuyers({ q, status });

  return (
    <div className="space-y-4">
      <h1 className="text-headline-small font-semibold">구매사</h1>
      <form method="GET" className="flex gap-2">
        <input
          name="q"
          defaultValue={q ?? ''}
          placeholder="회사명 검색"
          className="rounded border border-outline-variant px-3 py-1.5 text-body-small bg-surface focus:outline-none focus:ring-1 focus:ring-primary w-64"
        />
        <select
          name="status"
          defaultValue={status ?? ''}
          className="rounded border border-outline-variant px-3 py-1.5 text-body-small bg-surface"
        >
          <option value="">전체</option>
          <option value="pending">대기</option>
          <option value="active">활성</option>
          <option value="suspended">정지</option>
        </select>
        <button
          type="submit"
          className="rounded bg-primary text-on-primary px-3 py-1.5 text-label-small"
        >
          검색
        </button>
      </form>
      <div className="rounded border border-outline-variant overflow-hidden">
        <table className="w-full text-body-small">
          <thead>
            <tr className="border-b border-outline-variant bg-surface-container-low">
              <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium">회사명</th>
              <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium">상태</th>
              <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium">가입일</th>
            </tr>
          </thead>
          <tbody>
            {buyers.map((b) => (
              <tr
                key={b.id}
                className="border-b border-outline-variant last:border-0 hover:bg-surface-container-low"
              >
                <td className="px-4 py-3">
                  <Link href={`/buyers/${b.id}`} className="text-primary hover:underline">
                    {b.name}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <AdminStatusBadge status={b.status} />
                </td>
                <td className="px-4 py-3 md-numeric text-label-small text-on-surface-variant">
                  {new Date(b.createdAt).toLocaleDateString('ko-KR')}
                </td>
              </tr>
            ))}
            {buyers.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-on-surface-variant">
                  등록된 구매사가 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
