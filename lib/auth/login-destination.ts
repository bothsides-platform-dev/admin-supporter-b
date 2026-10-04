/**
 * Only root-relative admin destinations may survive OAuth. Decode the path for
 * validation so encoded separators/dot segments cannot hide a login loop.
 */
export function safeLoginDestination(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return '/';
  try {
    const decoded = decodeURIComponent(value);
    if (/[\\\x00-\x1f\x7f]/.test(decoded)) return '/';
    const origin = 'https://admin.local';
    const url = new URL(value, origin);
    const checked = new URL(decoded, origin);
    if (url.origin !== origin || checked.origin !== origin) return '/';
    if (/^\/(?:login|auth|api\/auth)(?:\/|$)/i.test(checked.pathname)) return '/';
    return url.pathname + url.search + url.hash;
  } catch {
    return '/';
  }
}
