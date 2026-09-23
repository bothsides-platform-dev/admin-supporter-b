'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { adminNotes, adminAuditLogs } from '@/lib/db/schema';
import { requireAdminPermission } from '@/lib/auth/admin-session';
import { actionDb } from '@/lib/server/actions/auth/_shared';

type Result = { ok: true } | { ok: false; error: string };

export async function deleteAdminNoteAction(
  noteId: string,
  revalidate?: string,
): Promise<Result> {
  const session = await requireAdminPermission('notes.write');

  const result = await actionDb().transaction(async (tx) => {
    const [note] = await tx.delete(adminNotes).where(eq(adminNotes.id, noteId)).returning();
    if (!note) return { ok: false as const, error: 'NOT_FOUND' };
    await tx.insert(adminAuditLogs).values({
      actor: session.adminId,
      action: 'note.delete',
      entityType: note.entityType,
      entityId: note.entityId,
      payloadJson: { before: { noteId, body: note.body, createdBy: note.createdBy }, after: {} },
    });
    return { ok: true as const };
  });
  if (!result.ok) return result;

  if (revalidate) revalidatePath(revalidate);
  return { ok: true };
}
