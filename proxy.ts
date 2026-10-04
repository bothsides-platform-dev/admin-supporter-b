import { auth } from '@/auth';

export default auth((req) => {
  if (!req.auth) {
    const requested = new URL(req.url);
    const login = new URL('/login', requested);
    login.searchParams.set('callbackUrl', requested.pathname + requested.search);
    return Response.redirect(login);
  }
});

export const config = {
  matcher: [
    '/((?!login$|login/|api/auth|_next/static|_next/image|favicon\\.ico$).*)',
  ],
};
