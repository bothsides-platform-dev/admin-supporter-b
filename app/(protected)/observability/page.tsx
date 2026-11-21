import Link from 'next/link';
import { unstable_rethrow } from 'next/navigation';
import { AdminPageHeader } from '@/components/AdminPageHeader';
import { ObservabilityDashboard } from '@/components/ObservabilityDashboard';
import { getObservability, InvalidFilters, QueryLimit } from '@/lib/server/observability';

export const dynamic = 'force-dynamic';
export const metadata = { title: '시스템 관측' };

export default async function ObservabilityPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  let data;
  try {
    data = await getObservability(await searchParams);
  } catch (error) {
    unstable_rethrow(error);
    // Permission errors must not become a successful page with a generic notice.
    if (!(error instanceof InvalidFilters) && !(error instanceof QueryLimit)) throw error;
    return <div className="space-y-4"><AdminPageHeader title="시스템 관측" /><p role="alert">{error instanceof InvalidFilters ? '조회 조건이 올바르지 않습니다. 기간과 종료 시각을 확인해 주세요.' : '조회 횟수가 많습니다. 1분 후 다시 조회해 주세요.'}</p><Link href="/observability" className="text-primary hover:underline">기본 조건으로 돌아가기</Link></div>;
  }
  return <ObservabilityDashboard data={data} />;
}
