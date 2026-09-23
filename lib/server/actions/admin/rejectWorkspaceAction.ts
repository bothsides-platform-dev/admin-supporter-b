'use server';

import { actionDb } from '@/lib/server/actions/auth/_shared';
import { reviewApplication, type ReviewSnapshot } from './reviewApplication';

export async function rejectWorkspaceAction(
  db: ReturnType<typeof actionDb> = actionDb(),
  applicationId: string,
  reason: string,
  expected?: ReviewSnapshot,
) {
  return reviewApplication(db, applicationId, 'reject', reason, expected);
}
