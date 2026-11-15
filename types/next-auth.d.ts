import 'next-auth';

declare module 'next-auth' {
  interface Session {
    /** Login session id minted at Google sign-in (see auth.ts jwt callback). */
    sid?: string;
  }
}
