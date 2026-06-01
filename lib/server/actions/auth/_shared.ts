// Shared helpers for auth server actions.
// - Action results are JSON only (no redirect()/cookies()) so the client
//   can decide what to do next (sessionStorage hand-off + signIn() at the
//   right moment per advisor block C).
// - Outbox enqueue uses minimal placeholder subject/html: Step 10 owns the
//   real templates + Sender. Don't build a template helper here.
import { db as prodDb } from '@/lib/db/index';
import type { DB } from '@/lib/db/index';

// `T` is the success-payload shape. Default is an empty object so callers
// that don't carry data can write `Promise<AuthActionResult>` without
// listing a generic.
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type AuthActionResult<T extends object = {}> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

export function actionDb(): DB {
  return prodDb;
}

// Default base URL for the admin app's own domain (for internal links).
export function baseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_BASE_URL ??
    process.env.AUTH_URL ??
    'http://localhost:3001'
  );
}

// User-facing app origin — for email links pointing to the MAIN app
// (login, signup). Set PUBLIC_APP_URL=https://supporter-b.store in .env.production.
export function appBaseUrl(): string {
  return (
    process.env.PUBLIC_APP_URL ??
    process.env.NEXT_PUBLIC_BASE_URL ??
    'http://localhost:3000'
  );
}

// (Step 10) The previous `devLogVerifyLink` console fallback is gone. The
// equivalent dev affordance now lives in `lib/integrations/resend.ts` —
// `ResendSender` logs `[email DEV] event=... to=... subject=... dedupeKey=...`
// when `RESEND_API_KEY` is unset, so every action's verify URL surfaces
// through the unified outbox path instead of action-specific helpers.

// 15-minute bucket used for `signup-verify` dedupe keys so a flurry of resend
// clicks within the same window don't spam the queue. Step 1 bucket = floor
// of unix-minutes / 15.
export function bucket15Min(now: Date = new Date()): number {
  return Math.floor(now.getTime() / (15 * 60_000));
}

// Email normalisation — Auth.js authorize already lowercases + trims; do the
// same here so equal addresses dedupe at the action layer too.
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function emailDomain(email: string): string | null {
  const at = email.indexOf('@');
  if (at < 0 || at === email.length - 1) return null;
  return email.slice(at + 1);
}

// Postgres unique-violation (23505) detector that works in BOTH runtimes:
// postgres-js (prod) exposes `.code` directly; pglite (tests) nests it under
// `.cause.code`. Use this so a duplicate-key catch maps to a friendly error
// while genuinely unexpected DB errors are re-thrown (→ onRequestError/Sentry).
export function isUniqueViolation(err: unknown): boolean {
  const direct = (err as { code?: unknown } | null)?.code;
  const nested = (err as { cause?: { code?: unknown } } | null)?.cause?.code;
  return direct === '23505' || nested === '23505';
}
