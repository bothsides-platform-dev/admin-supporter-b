import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';

const ALLOWED_EMAILS = [
  'bothsides2026@gmail.com',
  'yeonseong.dev@gmail.com',
  'skcjfdnd1996@gmail.com',
  'ihopyhapy29@gmail.com',
];

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [Google],
  callbacks: {
    signIn({ user }) {
      return ALLOWED_EMAILS.includes(user.email ?? '');
    },
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
});
