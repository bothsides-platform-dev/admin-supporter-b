/** Reject external URLs and cross-resource return paths. */
export function safeListReturnTo(value: unknown, base: '/buyers' | '/sellers' | '/users' | '/rfps'): string {
  if (typeof value !== 'string' || !value.startsWith(base) || value.startsWith('//')) return base;
  try {
    const url = new URL(value, 'http://admin.local');
    if (url.origin !== 'http://admin.local' || url.pathname !== base || url.hash) return base;
    return `${url.pathname}${url.search}`;
  } catch {
    return base;
  }
}
