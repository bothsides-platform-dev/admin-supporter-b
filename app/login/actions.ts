'use server';

import { cookies } from 'next/headers';
import { signIn, signOut } from '@/auth';

// Cookies use the `admin-authjs.*` base (see auth.ts) so they never collide with
// the main app's parent-domain `authjs.*` cookies. The legacy `authjs.session-token`
// entry is kept for one-time cleanup of host-only cookies left by older builds.
const AUTH_COOKIE_BASES = [
  'admin-authjs.session-token',
  'admin-authjs.callback-url',
  'admin-authjs.csrf-token',
  'admin-authjs.pkce.code_verifier',
  'admin-authjs.state',
  'admin-authjs.nonce',
  'authjs.session-token',
];

function authCookieNames(base: string): string[] {
  const names = [base, `__Secure-${base}`, `__Host-${base}`];
  // session-token may be split into chunks: .0, .1, …
  if (base.endsWith('.session-token')) {
    for (const p of ['', '__Secure-']) {
      for (let i = 0; i < 5; i++) names.push(`${p}${base}.${i}`);
    }
  }
  return names;
}

export async function googleSignInAction() {
  // Clear stale Auth.js cookies before starting the OAuth flow so that
  // leftover state/pkce/csrf cookies from a previous (abandoned) login
  // attempt don't cause InvalidCheck / UntrustedHost failures.
  // signIn() issues fresh check cookies after this, so there is no conflict.
  const jar = await cookies();
  for (const base of AUTH_COOKIE_BASES) {
    for (const name of authCookieNames(base)) {
      if (jar.has(name)) jar.delete(name);
    }
  }
  await signIn('google', { redirectTo: '/' });
}

export async function logoutAction() {
  await signOut({ redirectTo: '/login' });
}
