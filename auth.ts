import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';

const ALLOWED_EMAILS = (process.env.ADMIN_EMAILS ?? '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export const { handlers, signIn, signOut, auth } = NextAuth({
  trustHost: true,
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
