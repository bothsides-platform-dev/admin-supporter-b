'use server';

import { actionDb } from '@/lib/server/actions/auth/_shared';
import { reviewApplication, type ReviewSnapshot } from './reviewApplication';
import type { MerchantTier } from '@/lib/types/biz-profile';

/** Approve one verification application. The first argument permits an injected test DB. */
export async function approveWorkspaceAction(
  db: ReturnType<typeof actionDb> = actionDb(),
  applicationId: string,
  grade?: MerchantTier,
  expected?: ReviewSnapshot,
) {
  return reviewApplication(db, applicationId, 'approve', grade, expected);
}
