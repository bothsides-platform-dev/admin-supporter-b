/** Only return to lists that link to this kind of detail page. */
export function safeListReturnTo(value: unknown, base: '/buyers' | '/sellers' | '/users' | '/rfps'): string {
  if (typeof value !== 'string') return base;
  const allowed: string[] = [base, '/search'];
  if (base === '/sellers' || base === '/rfps') allowed.push('/pg-status');
  if (base === '/rfps') allowed.push('/rfps/board');
  if (!allowed.some((path) => value.startsWith(path))) return base;
  try {
    const url = new URL(value, 'http://admin.local');
    if (url.origin !== 'http://admin.local' || !allowed.includes(url.pathname) || url.hash) return base;
    return `${url.pathname}${url.search}`;
  } catch {
    return base;
  }
}

export function listReturnLabel(href: string, fallback: string) {
  const labels: Record<string, string> = { '/pg-status': 'PG사별 현황', '/rfps/board': '신청 진행 보드', '/search': '고객 검색' };
  return labels[href.split('?')[0]] ?? fallback;
}
