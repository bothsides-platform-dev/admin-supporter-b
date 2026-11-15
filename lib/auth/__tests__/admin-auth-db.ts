import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import * as schema from '@/lib/db/schema';
import type { DB } from '@/lib/db/index';

/** Test-only PGlite with the tables the admin auth flow touches (DDL = bidit's). */
export async function createAdminAuthDb(): Promise<{ client: PGlite; db: DB }> {
  const client = new PGlite();
  await client.exec(`
    CREATE TABLE admin_users (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      email text NOT NULL,
      totp_secret_enc text,
      totp_enabled_at timestamp with time zone,
      totp_last_used_step bigint,
      created_by text,
      created_at timestamp with time zone DEFAULT now() NOT NULL,
      updated_at timestamp with time zone DEFAULT now() NOT NULL,
      CONSTRAINT admin_users_email_unique UNIQUE (email),
      CONSTRAINT admin_users_email_lower CHECK (email = lower(email))
    );
    CREATE TABLE login_attempts (
      key text PRIMARY KEY, count integer NOT NULL DEFAULT 0,
      locked_until timestamptz, updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE admin_audit_logs (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor text NOT NULL, action text NOT NULL,
      entity_type text NOT NULL, entity_id uuid NOT NULL, payload_json jsonb,
      occurred_at timestamptz NOT NULL DEFAULT now()
    );
  `);
  return { client, db: drizzle(client, { schema, casing: 'snake_case' }) as unknown as DB };
}

export async function insertAdmin(client: PGlite, email: string, id?: string): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    id ? 'INSERT INTO admin_users (id, email) VALUES ($1, $2) RETURNING id' : 'INSERT INTO admin_users (email) VALUES ($1) RETURNING id',
    id ? [id, email] : [email],
  );
  return rows[0].id;
}

export const TEST_TOTP_KEY = Buffer.alloc(32, 9).toString('base64');
