import { AdminViewTabs } from '@/components/AdminViewTabs';

export function RfpViewTabs({ current }: { current: 'rfps' | 'board' | 'pg-status' }) {
  return <AdminViewTabs label="RFP 보기" tabs={[
    { label: 'RFP 목록', href: '/rfps', active: current === 'rfps' },
    { label: '신청 진행 보드', href: '/rfps/board', active: current === 'board' },
    { label: 'PG사별 현황', href: '/pg-status', active: current === 'pg-status' },
  ]} />;
}
