'use server';

import { eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { users, adminAuditLogs } from '@/lib/db/schema';
import { requireSuperAdmin } from '@/lib/auth/admin-session';
import { actionDb } from '@/lib/server/actions/auth/_shared';

export async function deleteUserAction(userId: string): Promise<void> {
  const session = await requireSuperAdmin();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await actionDb().transaction(async (tx: any) => {
    // 삭제 전 스냅샷을 감사 로그에 기록 (FK 없어 삭제 후에도 존재)
    const [userRow] = await tx
      .select({ email: users.email, name: users.name })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    await tx.insert(adminAuditLogs).values({
      actor: session.adminId,
      action: 'user.hard_delete',
      entityType: 'user',
      entityId: userId,
      payloadJson: {
        snapshot: { email: userRow?.email, name: userRow?.name },
      },
    });

    await tx.delete(users).where(eq(users.id, userId));
  });

  redirect('/users');
}
