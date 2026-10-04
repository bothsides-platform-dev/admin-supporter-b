import { expect, it } from 'vitest';
import { unstable_getResponseFromNextConfig, getRedirectUrl } from 'next/experimental/testing/server';
import nextConfig from './next.config';
it.each([
  ['/admin/review?status=pending', 'https://admin.test/review?status=pending'],
  ['/admin/review/a1?from=email', 'https://admin.test/review/a1?from=email'],
])('permanently redirects legacy %s', async (path, target) => {
  const response = await unstable_getResponseFromNextConfig({ url: 'https://admin.test' + path, nextConfig });
  expect(response.status).toBe(308);
  expect(getRedirectUrl(response)).toBe(target);
});
it('keeps the real /admin/pg-members route', async () => {
  const response = await unstable_getResponseFromNextConfig({ url: 'https://admin.test/admin/pg-members', nextConfig });
  expect(getRedirectUrl(response)).toBeNull();
});
