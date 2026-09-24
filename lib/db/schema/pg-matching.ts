import { check, pgTable, text, uuid, jsonb, timestamp } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { pgRecommendationGroups } from './pg-recommendations';
import type { MatchingPolicy } from '@/lib/pg-matching-policy';

// DDL ownership: supporter-b. Apply its additive migration before either app.
export const pgMatchingDefaults = pgTable('pg_matching_defaults', {
  id: text('id').primaryKey().default('default'),
  policy: jsonb('policy').$type<MatchingPolicy>().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [check('pg_matching_defaults_singleton', sql`${t.id} = 'default'`)]);

export const pgMatchingPolicies = pgTable('pg_matching_policies', {
  groupId: uuid('group_id').primaryKey().references(() => pgRecommendationGroups.id, { onDelete: 'cascade' }),
  policy: jsonb('policy').$type<MatchingPolicy>().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
