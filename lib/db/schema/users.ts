import { pgTable, uuid, text, timestamp, boolean } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  name: text('name').notNull(),
  phone: text('phone'),
  avatarColor: text('avatar_color').notNull().default('#000'),
  status: text('status').notNull().default('active'),
  // 이메일 인증 플래그 — 메인 앱(bidit)이 소유하는 컬럼. admin 은 읽기 전용으로
  // 심사 큐 뱃지 표시 + 승인 게이트(인증된 유저만 승인)에 사용한다.
  emailVerified: boolean('email_verified').notNull().default(false),
  emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
  // Remembered active workspace — restored on login so a multi-workspace user
  // lands where they left off. Nullable; set on first ws creation (signup /
  // createWorkspace) and on every switchWorkspaceAction. The FK (ON DELETE SET
  // NULL → workspaces.id) is declared in 0001_multi_workspace.sql, NOT via
  // .references() here — importing `workspaces` would form a users→workspaces→
  // biz_profiles→users type cycle (TS7022). Migrations are hand-written, so the
  // Drizzle-level .references() is unnecessary.
  lastActiveWorkspaceId: uuid('last_active_workspace_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
  // Auto-maintained by the `set_updated_at` trigger (see 0000 migration).
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(sql`now()`),
});
