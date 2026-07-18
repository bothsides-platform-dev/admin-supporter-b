import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';

const ALLOWED_EMAILS = (process.env.ADMIN_EMAILS ?? '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

// This admin app shares its parent domain (support-b.com) with the main app,
// which scopes its Auth.js session cookie to `Domain=.support-b.com`. Because
// both apps use Auth.js' default cookie names, that parent-domain cookie collides
// with this app's host-only cookie of the SAME name on admin.support-b.com —
// the browser sends both, @auth/core reads the wrong one, decryption fails, and
// the user is bounced back to /login (only clearing cookies "fixes" it).
// Giving this app uniquely-named cookies (`admin-authjs.*`) removes the collision
// for good. Names/options mirror @auth/core's defaultCookies(), base name aside.
const useSecureCookies =
  (process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? '').startsWith('https://') ||
  process.env.NODE_ENV === 'production';
const securePrefix = useSecureCookies ? '__Secure-' : '';
const hostPrefix = useSecureCookies ? '__Host-' : '';
const lax = { httpOnly: true, sameSite: 'lax', path: '/', secure: useSecureCookies } as const;

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
    signIn({ user }) {
      return ALLOWED_EMAILS.includes((user.email ?? '').toLowerCase());
    },
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
});
