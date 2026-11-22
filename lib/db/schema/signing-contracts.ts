import { pgTable, uuid } from 'drizzle-orm/pg-core';

// bidit owns the signing lifecycle. Follow-ups reference a specific contract round.
export const signingContracts = pgTable('signing_contracts', {
  id: uuid('id').primaryKey(),
});
