'use server';

import { signIn, signOut } from '@/auth';

export async function googleSignInAction() {
  await signIn('google', { redirectTo: '/' });
}

export async function logoutAction() {
  await signOut({ redirectTo: '/login' });
}
