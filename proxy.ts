import { auth } from '@/auth';
import { MFA_COOKIE_NAME, verifyMfaCookie } from '@/lib/auth/mfa-cookie';

function redirectWithDestination(path: string, requested: URL): Response {
  const target = new URL(path, requested);
  target.searchParams.set('callbackUrl', requested.pathname + requested.search);
  return Response.redirect(target);
}

/**
 * UX gate that preserves deep links through login and 2FA. Only the proxy
 * knows the requested URL; requireAdminSession() stays the fail-closed
 * authority (it also checks the DB allowlist and the TOTP enrollment time,
 * which this DB-less check cannot).
 */
export default auth((req) => {
  const requested = new URL(req.url);
  if (!req.auth) return redirectWithDestination('/login', requested);

  const email = req.auth.user?.email?.trim().toLowerCase() ?? '';
  const sid = req.auth.sid ?? '';
  const passed = verifyMfaCookie({ value: req.cookies.get(MFA_COOKIE_NAME)?.value, email, sid, now: new Date() });
  if (!passed) return redirectWithDestination('/login/2fa', requested);
});

export const config = {
  matcher: [
    '/((?!login$|login/|api/auth|api/marketing/session$|_next/static|_next/image|favicon\\.ico$).*)',
  ],
};
