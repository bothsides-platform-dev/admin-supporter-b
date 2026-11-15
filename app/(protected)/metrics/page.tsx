import { MetricsDashboard } from '@/components/MetricsDashboard';
import { parseWeeks } from '@/lib/metrics/periods';
import { getMetricsOverview } from '@/lib/server/queries/admin/metrics';

export const dynamic = 'force-dynamic';

export default async function MetricsPage({ searchParams }: { searchParams: Promise<{ weeks?: string }> }) {
  const { weeks } = await searchParams;
  const overview = await getMetricsOverview({ weeks: parseWeeks(weeks) });
  return <MetricsDashboard overview={overview} />;
}
