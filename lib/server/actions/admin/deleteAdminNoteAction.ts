'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { adminNotes, adminAuditLogs } from '@/lib/db/schema';
import { requireAdminSession } from '@/lib/auth/admin-session';
import { actionDb } from '@/lib/server/actions/auth/_shared';

type Result = { ok: true } | { ok: false; error: string };

export async function deleteAdminNoteAction(
  noteId: string,
  revalidate?: string,
): Promise<Result> {
  const session = await requireAdminSession();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await actionDb().transaction(async (tx: any) => {
    await tx.delete(adminNotes).where(eq(adminNotes.id, noteId));
    await tx.insert(adminAuditLogs).values({
      actor: session.adminId,
      action: 'note.delete',
      entityType: 'admin_note',
      entityId: noteId,
      payloadJson: {},
    });
  });

  if (revalidate) revalidatePath(revalidate);
  return { ok: true };
}
