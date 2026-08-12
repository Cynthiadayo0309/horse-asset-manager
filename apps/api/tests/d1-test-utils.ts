import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Miniflare } from 'miniflare';

import { SESSION_COOKIE } from '../src/lib/auth';
import { hashSessionToken } from '../src/lib/password';
import type { Env } from '../src/types';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const migrationDirectory = join(root, 'migrations');
const timestamp = '2026-08-12T00:00:00.000Z';

export interface D1Harness {
  miniflare: Miniflare;
  database: D1Database;
  env: Env;
}

export interface TestUser {
  id: number;
  cookie: string;
  expenseCategoryId: number;
  incomeCategoryId: number;
}

export async function createD1Harness(): Promise<D1Harness> {
  const miniflare = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('OK'); } }",
    compatibilityDate: '2026-08-08',
    d1Databases: ['DB'],
  });
  const database = await miniflare.getD1Database('DB');
  await database.exec('PRAGMA foreign_keys = ON;');
  for (const filename of readdirSync(migrationDirectory)
    .filter((name) => name.endsWith('.sql'))
    .sort()) {
    const statements = readFileSync(join(migrationDirectory, filename), 'utf8')
      .split('--> statement-breakpoint')
      .map((statement) => statement.trim())
      .filter(Boolean)
      .map((statement) => database.prepare(statement));
    await database.batch(statements);
  }
  return {
    miniflare,
    database,
    env: { APP_ENV: 'local', ALLOW_REGISTRATION: 'true', DB: database },
  };
}

export async function createTestUser(database: D1Database, email: string): Promise<TestUser> {
  await database
    .prepare(
      `INSERT INTO users (email, name, password_hash, role, status, setup_completed, created_at, updated_at)
       VALUES (?, ?, 'test-only', 'user', 'active', 1, ?, ?)`,
    )
    .bind(email, email, timestamp, timestamp)
    .run();
  const user = await database
    .prepare('SELECT id FROM users WHERE email = ?')
    .bind(email)
    .first<{ id: number }>();
  if (!user) throw new Error('Failed to create test user.');

  await database.batch([
    database
      .prepare(
        `INSERT INTO categories (user_id, name, category_type, system_code, sort_order, status, created_at, updated_at)
         VALUES (?, 'テスト支出', 'expense', 'test_expense', 0, 'active', ?, ?)`,
      )
      .bind(user.id, timestamp, timestamp),
    database
      .prepare(
        `INSERT INTO categories (user_id, name, category_type, system_code, sort_order, status, created_at, updated_at)
         VALUES (?, 'テスト入金', 'income', 'test_income', 1, 'active', ?, ?)`,
      )
      .bind(user.id, timestamp, timestamp),
  ]);
  const categories = await database
    .prepare('SELECT id, category_type AS categoryType FROM categories WHERE user_id = ?')
    .bind(user.id)
    .all<{ id: number; categoryType: 'expense' | 'income' }>();

  const token = `session-${email}`;
  await database
    .prepare(
      `INSERT INTO sessions (id, user_id, expires_at, last_used_at, created_at)
       VALUES (?, ?, '2999-12-31T23:59:59.999Z', ?, ?)`,
    )
    .bind(await hashSessionToken(token), user.id, timestamp, timestamp)
    .run();
  const expenseCategoryId = categories.results.find((row) => row.categoryType === 'expense')?.id;
  const incomeCategoryId = categories.results.find((row) => row.categoryType === 'income')?.id;
  if (!expenseCategoryId || !incomeCategoryId) throw new Error('Failed to create test categories.');
  return {
    id: user.id,
    cookie: `${SESSION_COOKIE}=${token}`,
    expenseCategoryId,
    incomeCategoryId,
  };
}

export async function insertAndGetId(
  database: D1Database,
  sql: string,
  ...bindings: unknown[]
): Promise<number> {
  await database
    .prepare(sql)
    .bind(...bindings)
    .run();
  const row = await database.prepare('SELECT last_insert_rowid() AS id').first<{ id: number }>();
  if (!row) throw new Error('Insert did not return an id.');
  return row.id;
}

export const testTimestamp = timestamp;
