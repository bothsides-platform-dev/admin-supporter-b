// Post-commit outbox flush — fire-and-forget after a successful action tx.
import { after } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { db } from '@/lib/db/index';
import { DrizzleOutboxRepository } from '@/lib/server/repositories/drizzle/outbox';
import { getResendSender } from '@/lib/integrations/resend';

const FLUSH_BATCH = 50;

async function doFlush(): Promise<void> {
  try {
    const outbox = new DrizzleOutboxRepository(db);
    await outbox.flush(getResendSender(), FLUSH_BATCH);
  } catch (err) {
    console.error('post-commit flush failed', err);
    Sentry.captureException(err, { extra: { context: 'post-commit-flush' } });
  }
}

export function flushAfterCommit(): void {
  try {
    after(doFlush);
  } catch (err) {
    // after() throws outside a Next.js request scope (e.g., cron) — safe to ignore there.
    if (process.env.NODE_ENV !== 'test') {
      console.warn('flushAfterCommit: after() not available', err);
    }
  }
}
