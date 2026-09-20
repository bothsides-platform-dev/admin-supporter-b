import { pgTable, uuid, integer, jsonb, timestamp } from 'drizzle-orm/pg-core';
import { workspaces } from './workspaces';
import type { AgreementRate } from '@/lib/agreement-rates';
// DDL owner: bidit. Never deploy this reader before the additive migration.
export const pgAgreementRates = pgTable('pg_agreement_rates', {
  pgWsId: uuid('pg_ws_id')
    .primaryKey()
    .references(() => workspaces.id),
  version: integer('version').notNull().default(1),
  rates: jsonb('rates').$type<AgreementRate[]>().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
