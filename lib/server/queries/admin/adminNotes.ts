import { and, desc, eq } from 'drizzle-orm';
import { adminNotes } from '@/lib/db/schema';
import { actionDb } from '@/lib/server/actions/auth/_shared';

export type AdminNoteRow = {
  id: string;
  body: string;
  createdBy: string;
  createdAt: Date;
};

export async function getAdminNotes(
  entityType: string,
  entityId: string,
): Promise<AdminNoteRow[]> {
  return actionDb()
    .select({
      id: adminNotes.id,
      body: adminNotes.body,
      createdBy: adminNotes.createdBy,
      createdAt: adminNotes.createdAt,
    })
    .from(adminNotes)
    .where(
      and(
        eq(adminNotes.entityType, entityType),
        eq(adminNotes.entityId, entityId),
      ),
    )
    .orderBy(desc(adminNotes.createdAt)) as Promise<AdminNoteRow[]>;
}
