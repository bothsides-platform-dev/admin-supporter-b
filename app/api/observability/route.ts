import { getObservability, InvalidFilters, QueryLimit } from '@/lib/server/observability';
import { unstable_rethrow } from 'next/navigation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };

export async function GET(request: Request) {
  try {
    const data = await getObservability(Object.fromEntries(new URL(request.url).searchParams));
    return Response.json(data, { headers });
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof InvalidFilters) return Response.json({ error: '조회 조건을 확인해 주세요.' }, { status: 400, headers });
    if (error instanceof QueryLimit) return Response.json({ error: '조회가 많습니다. 잠시 후 다시 시도해 주세요.' }, { status: 429, headers: { ...headers, 'Retry-After': '60' } });
    return Response.json({ error: '관측 데이터를 불러오지 못했습니다.' }, { status: 503, headers });
  }
}
