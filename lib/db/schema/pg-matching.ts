import { pgTable, uuid, jsonb, timestamp } from 'drizzle-orm/pg-core';
import { pgRecommendationGroups } from './pg-recommendations';
import type { MatchingPolicy } from '@/lib/pg-matching-policy';

// DDL ownership: supporter-b. Apply its additive migration before either app.
export const pgMatchingPolicies = pgTable('pg_matching_policies', {
  groupId: uuid('group_id').primaryKey().references(() => pgRecommendationGroups.id, { onDelete: 'cascade' }),
  policy: jsonb('policy').$type<MatchingPolicy>().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
