import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import { hostPrefix, laxCookieOptions as lax, securePrefix } from '@/lib/auth/cookie-config';

// This admin app shares its parent domain (support-b.com) with the main app,
// which scopes its Auth.js session cookie to `Domain=.support-b.com`. Because
// both apps use Auth.js' default cookie names, that parent-domain cookie collides
// with this app's host-only cookie of the SAME name on admin.support-b.com —
// the browser sends both, @auth/core reads the wrong one, decryption fails, and
// the user is bounced back to /login (only clearing cookies "fixes" it).
// Giving this app uniquely-named cookies (`admin-authjs.*`) removes the collision
// for good. Names/options mirror @auth/core's defaultCookies(), base name aside.
export const { handlers, signIn, signOut, auth } = NextAuth({
  trustHost: true,
  cookies: {
    sessionToken: { name: `${securePrefix}admin-authjs.session-token`, options: lax },
    callbackUrl: { name: `${securePrefix}admin-authjs.callback-url`, options: lax },
    csrfToken: { name: `${hostPrefix}admin-authjs.csrf-token`, options: lax },
    pkceCodeVerifier: {
      name: `${securePrefix}admin-authjs.pkce.code_verifier`,
      options: { ...lax, maxAge: 900 },
    },
    state: { name: `${securePrefix}admin-authjs.state`, options: { ...lax, maxAge: 900 } },
    nonce: { name: `${securePrefix}admin-authjs.nonce`, options: lax },
  },
  providers: [Google],
  callbacks: {
    // Allowlist lives in the shared DB (`admin_users`). Imported lazily so the
    // proxy bundle, which also imports this file, does not pull in the DB client.
    async signIn({ user }) {
      const email = user.email?.trim().toLowerCase();
      if (!email) return false;
      const [{ isAllowlistedAdmin }, { db }] = await Promise.all([
        import('@/lib/auth/admin-users'),
        import('@/lib/db/index'),
      ]);
      return isAllowlistedAdmin(db, email);
    },
    // `sid` identifies ONE Google login; the 2FA cookie is bound to it, so every
    // new login needs TOTP again. Minted only while the OAuth callback runs
    // (`account` present — trigger may be 'signIn' or 'signUp'); Auth.js' own
    // `jti` rotates on every re-encode so it cannot serve. Client-supplied
    // `update` data (public POST /api/auth/session) is never copied in.
    jwt({ token, account }) {
      if (account) token.sid = globalThis.crypto.randomUUID();
      return token;
    },
    session({ session, token }) {
      session.sid = typeof token.sid === 'string' ? token.sid : undefined;
      return session;
    },
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
});
