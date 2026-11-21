import { AdminViewTabs } from '@/components/AdminViewTabs';

export function RfpViewTabs({ current }: { current: 'rfps' | 'pg-status' }) {
  return <AdminViewTabs label="RFP 보기" tabs={[
    { label: 'RFP 목록', href: '/rfps', active: current === 'rfps' },
    { label: 'PG사별 현황', href: '/pg-status', active: current === 'pg-status' },
  ]} />;
}
