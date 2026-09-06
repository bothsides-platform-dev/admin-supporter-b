// Minimal type definitions for admin app — only outbox repo is used.
import type { PgTransaction } from 'drizzle-orm/pg-core';
import type { DB } from '@/lib/db/index';
import type { OutboxEntry, OutboxEvent, Sender } from '../outbox/types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Tx = DB | PgTransaction<any, any, any>;

export interface OutboxRepo {
  enqueue(
    params: {
      event: OutboxEvent;
      to: string;
      subject: string;
      html: string;
      dedupeKey?: string;
      maxAttempts?: number;
    },
    tx?: Tx,
  ): Promise<OutboxEntry | null>;
  pending(limit: number, tx?: Tx): Promise<OutboxEntry[]>;
  markResult(
    id: string,
    result: { ok: true } | { ok: false; error: string },
    tx?: Tx,
  ): Promise<void>;
  flush(
    sender: Sender,
    limit?: number,
    tx?: Tx,
  ): Promise<{ ok: number; failed: number }>;
}
