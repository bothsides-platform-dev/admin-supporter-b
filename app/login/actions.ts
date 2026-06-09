'use server';

import { cookies } from 'next/headers';
import { signIn, signOut } from '@/auth';

const AUTH_COOKIE_BASES = [
  'authjs.session-token',
  'authjs.callback-url',
  'authjs.csrf-token',
  'authjs.pkce.code_verifier',
  'authjs.state',
  'authjs.nonce',
];

function authCookieNames(base: string): string[] {
  const names = [base, `__Secure-${base}`, `__Host-${base}`];
  // session-token may be split into chunks: .0, .1, …
  if (base === 'authjs.session-token') {
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
