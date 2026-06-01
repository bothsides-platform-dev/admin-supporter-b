import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';

function getAllowedEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [Google],
  callbacks: {
    signIn({ user }) {
      return getAllowedEmails().includes((user.email ?? '').toLowerCase());
    },
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
});
