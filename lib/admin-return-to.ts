/** Only return to lists that link to this kind of detail page. */
export function safeListReturnTo(value: unknown, base: '/buyers' | '/sellers' | '/users' | '/rfps'): string {
  if (typeof value !== 'string') return base;
  const allowed = base === '/sellers' || base === '/rfps' ? [base, '/pg-status'] : [base];
  if (!allowed.some((path) => value.startsWith(path))) return base;
  try {
    const url = new URL(value, 'http://admin.local');
    if (url.origin !== 'http://admin.local' || !allowed.includes(url.pathname) || url.hash) return base;
    return `${url.pathname}${url.search}`;
  } catch {
    return base;
  }
}
