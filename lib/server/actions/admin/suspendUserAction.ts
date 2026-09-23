'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { users, adminAuditLogs } from '@/lib/db/schema';
import { requireAdminPermission } from '@/lib/auth/admin-session';
import { actionDb } from '@/lib/server/actions/auth/_shared';

type Result = { ok: true } | { ok: false; error: string };

export async function suspendUserAction(userId: string): Promise<Result> {
  const session = await requireAdminPermission('user.manage');

  const result = await actionDb().transaction(async (tx) => {
    const [before] = await tx.select({ status: users.status, deletedAt: users.deletedAt }).from(users).where(eq(users.id, userId)).for('update');
    if (!before || before.deletedAt) return { ok: false as const, error: 'NOT_FOUND' };
    if (before.status === 'suspended') return { ok: false as const, error: 'ALREADY_PROCESSED' };
    await tx.update(users).set({ status: 'suspended' }).where(eq(users.id, userId));
    await tx.insert(adminAuditLogs).values({
      actor: session.adminId,
      action: 'user.suspend',
      entityType: 'user',
      entityId: userId,
      payloadJson: { before: { status: before.status }, after: { status: 'suspended' } },
    });
    return { ok: true as const };
  });
  if (!result.ok) return result;

  revalidatePath(`/users/${userId}`);
  revalidatePath('/users');
  return { ok: true };
}
