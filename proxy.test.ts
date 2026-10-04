import { expect, it, vi } from 'vitest';
vi.mock('@/auth', () => ({ auth: (handler: unknown) => handler }));
import proxy from './proxy';
const run = proxy as unknown as (req: { url: string; auth: unknown }) => Response | undefined;
it.each(['/review/a1?from=email&tab=company', '/admin/review/a1?from=slack'])('preserves %s through login', (path) => {
  const response = run({ url: 'https://admin.test' + path, auth: null });
  const location = new URL(response!.headers.get('location')!);
  expect(location.pathname).toBe('/login');
  expect(location.searchParams.get('callbackUrl')).toBe(path);
});
it('allows authenticated requests through', () => {
  expect(run({ url: 'https://admin.test/review/a1', auth: { user: {} } })).toBeUndefined();
});
