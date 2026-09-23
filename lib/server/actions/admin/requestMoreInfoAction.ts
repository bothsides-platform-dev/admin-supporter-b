'use server';

import { actionDb } from '@/lib/server/actions/auth/_shared';
import { reviewApplication, bulkRequestMoreInfoAction as bulkReview, type ReviewSnapshot } from './reviewApplication';

export async function requestMoreInfoAction(
  db: ReturnType<typeof actionDb> = actionDb(),
  applicationId: string,
  reason: string,
  expected?: ReviewSnapshot,
) {
  return reviewApplication(db, applicationId, 'needs_more_info', reason, expected);
}

export async function bulkRequestMoreInfoAction(
  applicationIds: unknown,
  reason: unknown,
  db: ReturnType<typeof actionDb> = actionDb(),
) {
  return bulkReview(applicationIds, reason, db);
}
