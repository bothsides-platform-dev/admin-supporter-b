/**
 * Shared cookie naming for every auth cookie this app issues.
 *
 * This admin app shares its parent domain (support-b.com) with the main app,
 * which scopes its Auth.js cookies to `Domain=.support-b.com`. Every cookie
 * here therefore uses an `admin-` base name so it can never collide with a
 * main-app cookie (see auth.ts). Never hardcode `authjs.*` names.
 */
export const useSecureCookies =
  (process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? '').startsWith('https://') ||
  process.env.NODE_ENV === 'production';
export const securePrefix = useSecureCookies ? '__Secure-' : '';
export const hostPrefix = useSecureCookies ? '__Host-' : '';
export const laxCookieOptions = { httpOnly: true, sameSite: 'lax', path: '/', secure: useSecureCookies } as const;
