import type { PGlite } from '@electric-sql/pglite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAdminAuthDb, insertAdmin } from '@/lib/auth/__tests__/admin-auth-db';

const mocks = vi.hoisted(() => ({ db: undefined as unknown, actorId: '', denied: false }));
vi.mock('@/lib/server/actions/auth/_shared', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/actions/auth/_shared')>()),
  actionDb: () => mocks.db,
}));
vi.mock('@/lib/auth/admin-session', () => ({
  requireAdminPermission: async (permission: string) => {
    if (mocks.denied || permission !== 'admin.manage') throw new Error('PermissionDenied');
    return { adminId: 'ops@example.com', adminUserId: mocks.actorId, role: 'super_admin' };
  },
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { addAdminUserAction, removeAdminUserAction, resetAdminTotpAction } from '../adminUsers';

let client: PGlite;
let otherId: string;
const rows = async () => (await client.query<{ email: string; totp_enabled_at: Date | null; totp_secret_enc: string | null; created_by: string | null }>(
  'SELECT email, totp_enabled_at, totp_secret_enc, created_by FROM admin_users ORDER BY email',
)).rows;
const audit = async () => (await client.query<{ action: string; actor: string; entity_type: string }>(
  'SELECT action, actor, entity_type FROM admin_audit_logs ORDER BY occurred_at',
)).rows;

beforeEach(async () => {
  mocks.denied = false;
  const created = await createAdminAuthDb();
  client = created.client;
  mocks.db = created.db;
  mocks.actorId = await insertAdmin(client, 'ops@example.com');
  otherId = await insertAdmin(client, 'other@example.com');
});
afterEach(async () => { await client.close(); });

describe('addAdminUserAction', () => {
  it('adds a normalised email, records who added it, and audits', async () => {
    await expect(addAdminUserAction('  New.Admin@Example.com ')).resolves.toEqual({ ok: true });
    expect(await rows()).toContainEqual({ email: 'new.admin@example.com', totp_enabled_at: null, totp_secret_enc: null, created_by: 'ops@example.com' });
    expect(await audit()).toEqual([{ action: 'admin_user.create', actor: 'ops@example.com', entity_type: 'admin_user' }]);
  });

  it('rejects invalid and duplicate emails', async () => {
    await expect(addAdminUserAction('not-an-email')).resolves.toEqual({ ok: false, error: 'INVALID_EMAIL' });
    await expect(addAdminUserAction('OTHER@example.com')).resolves.toEqual({ ok: false, error: 'ADMIN_ALREADY_EXISTS' });
    expect(await audit()).toEqual([]);
  });

  it('requires admin.manage', async () => {
    mocks.denied = true;
    await expect(addAdminUserAction('x@example.com')).rejects.toThrow('PermissionDenied');
  });
});

describe('removeAdminUserAction', () => {
  it('removes another admin, lifts their 2FA lock, and audits', async () => {
    await client.query(`INSERT INTO login_attempts (key, count) VALUES ('admin-2fa:other@example.com', 5)`);
    await expect(removeAdminUserAction(otherId)).resolves.toEqual({ ok: true });
    expect((await rows()).map((r) => r.email)).toEqual(['ops@example.com']);
    expect((await client.query('SELECT * FROM login_attempts')).rows).toEqual([]);
    expect(await audit()).toEqual([{ action: 'admin_user.delete', actor: 'ops@example.com', entity_type: 'admin_user' }]);
  });

  it('refuses self-removal, unknown ids and removing the last account', async () => {
    await expect(removeAdminUserAction(mocks.actorId)).resolves.toEqual({ ok: false, error: 'CANNOT_CHANGE_SELF' });
    await expect(removeAdminUserAction('99999999-9999-4999-8999-999999999999')).resolves.toEqual({ ok: false, error: 'NOT_FOUND' });
    // the actor's own row disappeared concurrently → the target is the last account
    await client.query(`DELETE FROM admin_users WHERE id = '${mocks.actorId}'`);
    await expect(removeAdminUserAction(otherId)).resolves.toEqual({ ok: false, error: 'LAST_ADMIN_ACCOUNT' });
    expect((await rows()).map((r) => r.email)).toEqual(['other@example.com']);
  });
});

describe('resetAdminTotpAction', () => {
  it('clears another admin\'s TOTP and lock so they re-enroll, and audits', async () => {
    await client.query(`UPDATE admin_users SET totp_secret_enc = 'v1:a:b:c', totp_enabled_at = now(), totp_last_used_step = 42 WHERE id = '${otherId}'`);
    await client.query(`INSERT INTO login_attempts (key, count, locked_until) VALUES ('admin-2fa:other@example.com', 5, now() + interval '15 minutes')`);
    await expect(resetAdminTotpAction(otherId)).resolves.toEqual({ ok: true });
    const { rows: [row] } = await client.query<Record<string, unknown>>(
      `SELECT totp_secret_enc, totp_enabled_at, totp_last_used_step FROM admin_users WHERE id = '${otherId}'`,
    );
    expect(row).toEqual({ totp_secret_enc: null, totp_enabled_at: null, totp_last_used_step: null });
    expect((await client.query('SELECT * FROM login_attempts')).rows).toEqual([]);
    expect(await audit()).toEqual([{ action: 'admin_user.totp_reset', actor: 'ops@example.com', entity_type: 'admin_user' }]);
  });

  it('refuses resetting yourself or an unknown admin', async () => {
    await expect(resetAdminTotpAction(mocks.actorId)).resolves.toEqual({ ok: false, error: 'CANNOT_CHANGE_SELF' });
    await expect(resetAdminTotpAction('99999999-9999-4999-8999-999999999999')).resolves.toEqual({ ok: false, error: 'NOT_FOUND' });
  });
});
