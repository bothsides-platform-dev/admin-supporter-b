import { describe, expect, it, vi } from 'vitest';

type Callbacks = {
  signIn: (args: { user: { email?: string | null } }) => Promise<boolean>;
  jwt: (args: { token: Record<string, unknown>; account?: unknown; trigger?: string; session?: unknown }) => Record<string, unknown>;
  session: (args: { session: Record<string, unknown>; token: Record<string, unknown> }) => Record<string, unknown>;
};
const mocks = vi.hoisted(() => ({ config: undefined as unknown as { callbacks: Callbacks }, allowlisted: vi.fn() }));
vi.mock('next-auth', () => ({
  default: (config: { callbacks: Callbacks }) => {
    mocks.config = config;
    return { handlers: {}, auth: vi.fn(), signIn: vi.fn(), signOut: vi.fn() };
  },
}));
vi.mock('next-auth/providers/google', () => ({ default: {} }));
vi.mock('@/lib/db/index', () => ({ db: {} }));
vi.mock('@/lib/auth/admin-users', () => ({ isAllowlistedAdmin: mocks.allowlisted }));
await import('./auth');
const { callbacks } = mocks.config;

describe('Auth.js callbacks', () => {
  it('allows only emails in admin_users (normalised)', async () => {
    mocks.allowlisted.mockResolvedValueOnce(true);
    await expect(callbacks.signIn({ user: { email: ' Ops@Example.com ' } })).resolves.toBe(true);
    expect(mocks.allowlisted).toHaveBeenLastCalledWith({}, 'ops@example.com');
    mocks.allowlisted.mockResolvedValueOnce(false);
    await expect(callbacks.signIn({ user: { email: 'x@example.com' } })).resolves.toBe(false);
    await expect(callbacks.signIn({ user: { email: null } })).resolves.toBe(false);
  });

  it.each(['signIn', 'signUp'])('mints a fresh sid on the OAuth callback (trigger=%s)', (trigger) => {
    const first = callbacks.jwt({ token: { email: 'ops@example.com' }, account: { provider: 'google' }, trigger });
    const second = callbacks.jwt({ token: { email: 'ops@example.com' }, account: { provider: 'google' }, trigger });
    expect(first.sid).toMatch(/^[0-9a-f-]{36}$/);
    expect(second.sid).not.toBe(first.sid);
  });

  it('keeps the sid on refresh and never takes values from client update data', () => {
    const token = { email: 'ops@example.com', sid: 'original' };
    expect(callbacks.jwt({ token: { ...token } }).sid).toBe('original');
    const updated = callbacks.jwt({ token: { ...token }, trigger: 'update', session: { sid: 'attacker', mfa: true } });
    expect(updated).toEqual(token);
  });

  it('exposes the sid on the session only when it is a string', () => {
    expect(callbacks.session({ session: { user: {} }, token: { sid: 'abc' } }).sid).toBe('abc');
    expect(callbacks.session({ session: { user: {} }, token: {} }).sid).toBeUndefined();
  });
});
