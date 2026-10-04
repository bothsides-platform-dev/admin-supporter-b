import { beforeEach, expect, it, vi } from 'vitest';
const { signIn, jar } = vi.hoisted(() => ({
  signIn: vi.fn(), jar: { has: vi.fn(() => true), delete: vi.fn() },
}));
vi.mock('@/auth', () => ({ signIn, signOut: vi.fn() }));
vi.mock('next/headers', () => ({ cookies: async () => jar }));
import { googleSignInAction } from './actions';

beforeEach(() => vi.clearAllMocks());
it.each(['/review/a1?tab=company', '/admin/review/a1?from=email', '/admin/pg-members', '/review?query=Acme%20Co', '/'])('returns to %s after Google login', async (target) => {
  const form = new FormData();
  form.set('callbackUrl', target);
  await googleSignInAction(form);
  expect(signIn).toHaveBeenCalledWith('google', { redirectTo: target });
  expect(jar.delete).toHaveBeenCalledWith('admin-authjs.session-token');
});
it.each([undefined, '', 'https://evil.test', '//evil.test', '/\\evil.test', '/login', '/login?callbackUrl=/review/a1', '/api/auth/signin', '/auth/callback', '/%6cogin', '/review/../login', '/%2f%2fevil.test', '/review/%', '/review/\nevil'])('rejects unsafe destination %s', async (target) => {
  const form = new FormData();
  if (target !== undefined) form.set('callbackUrl', target);
  await googleSignInAction(form);
  expect(signIn).toHaveBeenCalledWith('google', { redirectTo: '/' });
});
