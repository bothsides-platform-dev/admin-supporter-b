import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
vi.stubGlobal('React', React);
vi.mock('./actions', () => ({ googleSignInAction: async () => {} }));
import AdminLoginPage from './page';
it('carries the requested review destination in the login form', async () => {
  const page = await AdminLoginPage({ searchParams: Promise.resolve({ callbackUrl: '/review/a1?from=email' }) });
  const html = renderToStaticMarkup(page);
  expect(html).toContain('name="callbackUrl"');
  expect(html).toContain('value="/review/a1?from=email"');
});
