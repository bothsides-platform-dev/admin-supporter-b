import { isValidElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const overview = { marker: 'overview' };
const load = vi.hoisted(() => vi.fn());
vi.mock('@/lib/server/queries/admin/metrics', () => ({ getMetricsOverview: load }));
vi.mock('@/components/MetricsDashboard', () => ({ MetricsDashboard: () => null }));

import MetricsPage from '../page';

beforeEach(() => {
  load.mockReset().mockResolvedValue(overview);
});

describe('핵심 지표 페이지', () => {
  it('URL 의 기간을 조회에 넘기고 결과를 화면 컴포넌트에 전달한다', async () => {
    const element = await MetricsPage({ searchParams: Promise.resolve({ weeks: '26' }) });

    expect(load).toHaveBeenCalledWith({ weeks: 26 });
    expect(isValidElement(element)).toBe(true);
    expect((element.props as { overview: unknown }).overview).toBe(overview);
  });

  it('허용하지 않은 기간은 기본 12주로 조회한다', async () => {
    await MetricsPage({ searchParams: Promise.resolve({ weeks: '9999' }) });
    await MetricsPage({ searchParams: Promise.resolve({}) });

    expect(load.mock.calls).toEqual([[{ weeks: 12 }], [{ weeks: 12 }]]);
  });
});
