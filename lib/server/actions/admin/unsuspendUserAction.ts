'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { users, adminAuditLogs } from '@/lib/db/schema';
import { requireAdminSession } from '@/lib/auth/admin-session';
import { actionDb } from '@/lib/server/actions/auth/_shared';

type Result = { ok: true } | { ok: false; error: string };

export async function unsuspendUserAction(userId: string): Promise<Result> {
  const session = await requireAdminSession();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await actionDb().transaction(async (tx: any) => {
    await tx.update(users).set({ status: 'active' }).where(eq(users.id, userId));
    await tx.insert(adminAuditLogs).values({
      actor: session.adminId,
      action: 'user.unsuspend',
      entityType: 'user',
      entityId: userId,
      payloadJson: { after: { status: 'active' } },
    });
  });

  revalidatePath(`/users/${userId}`);
  revalidatePath('/users');
  return { ok: true };
}
