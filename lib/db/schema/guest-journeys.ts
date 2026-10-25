import { pgTable, uuid, text, timestamp, jsonb } from 'drizzle-orm/pg-core';

// Read-only projection. DDL and retention belong to bidit; never include secret_hash.
export const guestJourneys = pgTable('guest_journeys', {
  draftId: uuid('draft_id').primaryKey(),
  userId: uuid('user_id'),
  workspaceId: uuid('workspace_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  retiredAt: timestamp('retired_at', { withTimezone: true }),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  analytics: jsonb('analytics').$type<unknown>(),
});
export const guestJourneyEvents = pgTable('guest_journey_events', {
  draftId: uuid('draft_id').notNull(),
  id: text('id').notNull(),
  payload: jsonb('payload').$type<unknown>(),
  observedAt: timestamp('observed_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
});
