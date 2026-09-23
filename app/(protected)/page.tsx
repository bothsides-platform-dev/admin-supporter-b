import Link from 'next/link';
import { getDashboardStats, getHotlist, getOldestApplications } from '@/lib/server/queries/admin/dashboard';

export default async function AdminDashboardPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const [stats, hotlist, oldest, params] = await Promise.all([getDashboardStats(), getHotlist(), getOldestApplications(), searchParams]);

  return (
    <div className="space-y-6">
      <h1 className="text-headline-small font-semibold">대시보드</h1>

      {params.error === 'PermissionDenied' && <p role="alert" className="rounded border border-error p-3 text-error">이 작업을 수행할 권한이 없습니다. 담당 관리자에게 요청해 주세요.</p>}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="신규 입점 심사" value={stats.pendingReviewCount} href="/review?status=submitted&sort=oldest" />
        <StatCard label="진행 중 RFP" value={stats.activeRfpCount} href="/rfps?status=sent" />
        <StatCard label="이름 변경 대기" value={stats.pendingNameChangeCount} href="/name-change-requests?status=pending" />
        <StatCard label="담당자 승인 대기" value={stats.pendingMemberCount} href="/admin/pg-members?status=pending" />
      </div>

      <section className="space-y-3">
        <h2 className="text-title-medium font-semibold">오래 기다린 입점 신청</h2>
        {oldest.length === 0 ? <p className="text-body-small text-on-surface-variant">처리할 신규 신청이 없습니다.</p> : <ul className="divide-y divide-outline-variant rounded border border-outline-variant">
          {oldest.map(item => <li key={item.id}><Link className="flex justify-between gap-3 px-4 py-3 hover:bg-surface-container-low" href={`/review/${item.id}?returnTo=${encodeURIComponent('/review?status=submitted&sort=oldest')}`}>
            <span>{item.name}</span><span className="text-body-small text-on-surface-variant">{item.waitingDays}일 대기</span>
          </Link></li>)}
        </ul>}
      </section>

      {hotlist.length > 0 && (
        <section>
          <h2 className="text-title-medium font-semibold mb-1">마감 임박 RFP</h2>
          <p className="text-body-small text-on-surface-variant mb-3">앞으로 48시간 안에 마감하는 진행 중 RFP · 최대 10건</p>
          <div className="rounded border border-outline-variant overflow-hidden">
            {hotlist.map((item) => (
              <Link
                key={`${item.type}-${item.entityId}`}
                href={item.href}
                className="flex items-center justify-between px-4 py-3 border-b border-outline-variant last:border-0 hover:bg-surface-container-low"
              >
                <div>
                  <span className="text-body-medium">{item.label}</span>
                  <span className="ml-3 text-body-small text-on-surface-variant">{item.subLabel}</span>
                </div>
                <span className="text-label-small text-primary">→</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function StatCard({ label, value, href }: { label: string; value: number; href: string }) {
  return (
    <Link
      href={href}
      className="block rounded border border-outline-variant bg-surface p-4 hover:bg-surface-container-low"
    >
      <div className="text-body-small text-on-surface-variant">{label}</div>
      <div className="mt-1 md-numeric text-3xl font-bold text-on-surface">{value}</div>
    </Link>
  );
}
