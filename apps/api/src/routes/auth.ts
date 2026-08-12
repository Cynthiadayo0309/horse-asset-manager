import {
  alertRules,
  auditLogs,
  budgets,
  clubs,
  createDatabase,
  users,
} from '@horse-asset-manager/database';
import { nowIso, todayInJapan } from '@horse-asset-manager/shared';
import { loginSchema, registerSchema, setupSchema } from '@horse-asset-manager/validation';
import { and, eq } from 'drizzle-orm';
import { Hono } from 'hono';

import { endSession, requireAuth, startSession } from '../lib/auth';
import { defaultAlertRules, defaultCategories } from '../lib/defaults';
import { ApiError, getIp, jsonChanges, ok, parseJson } from '../lib/http';
import { hashPassword, verifyPassword } from '../lib/password';
import type { AppBindings } from '../types';

export const authRoutes = new Hono<AppBindings>();

authRoutes.get('/config', (c) =>
  ok(c, { registrationAllowed: c.env.ALLOW_REGISTRATION === 'true' }),
);

authRoutes.post('/register', async (c) => {
  if (c.env.ALLOW_REGISTRATION !== 'true') {
    throw new ApiError(403, 'REGISTRATION_DISABLED', 'この環境では新規登録できません。');
  }
  const input = await parseJson(c, registerSchema);
  const email = input.email.trim().toLowerCase();
  const db = createDatabase(c.env.DB);
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (existing.length > 0)
    throw new ApiError(409, 'EMAIL_ALREADY_EXISTS', 'このメールアドレスは利用できません。');

  const timestamp = nowIso();
  const passwordHash = await hashPassword(input.password);
  const userSubquery = '(SELECT id FROM users WHERE email = ?)';
  const statements: D1PreparedStatement[] = [
    c.env.DB.prepare(
      'INSERT INTO users (email, name, password_hash, role, status, setup_completed, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(email, input.name, passwordHash, 'user', 'active', 0, timestamp, timestamp),
  ];
  defaultCategories.forEach(([name, categoryType, systemCode], sortOrder) => {
    statements.push(
      c.env.DB.prepare(
        `INSERT INTO categories (user_id, name, category_type, system_code, sort_order, status, created_at, updated_at) VALUES (${userSubquery}, ?, ?, ?, ?, 'active', ?, ?)`,
      ).bind(email, name, categoryType, systemCode, sortOrder, timestamp, timestamp),
    );
  });
  for (const [ruleType, condition] of defaultAlertRules) {
    statements.push(
      c.env.DB.prepare(
        `INSERT INTO alert_rules (user_id, rule_type, condition_json, is_enabled, notify_via, created_at, updated_at) VALUES (${userSubquery}, ?, ?, 1, 'in_app', ?, ?)`,
      ).bind(email, ruleType, JSON.stringify(condition), timestamp, timestamp),
    );
  }
  statements.push(
    c.env.DB.prepare(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, changes_json, ip_address, created_at) VALUES (${userSubquery}, 'create', 'users', ${userSubquery}, ?, ?, ?)`,
    ).bind(email, email, jsonChanges({ email, name: input.name }), getIp(c), timestamp),
  );
  await c.env.DB.batch(statements);

  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      setupCompleted: users.setupCompleted,
    })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  const user = rows[0];
  if (!user) throw new ApiError(422, 'REGISTRATION_FAILED', '利用者登録を完了できませんでした。');
  await startSession(c, user.id);
  return ok(c, user, '登録しました。', 201);
});

authRoutes.post('/login', async (c) => {
  const input = await parseJson(c, loginSchema);
  const email = input.email.trim().toLowerCase();
  const db = createDatabase(c.env.DB);
  const rows = await db
    .select()
    .from(users)
    .where(and(eq(users.email, email), eq(users.status, 'active')))
    .limit(1);
  const user = rows[0];
  if (!user || !(await verifyPassword(input.password, user.passwordHash))) {
    throw new ApiError(
      401,
      'INVALID_CREDENTIALS',
      'メールアドレスまたはパスワードが正しくありません。',
    );
  }
  await startSession(c, user.id);
  await db.insert(auditLogs).values({
    userId: user.id,
    action: 'login',
    entityType: 'sessions',
    entityId: null,
    changesJson: null,
    ipAddress: getIp(c),
    createdAt: nowIso(),
  });
  return ok(c, {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    setupCompleted: user.setupCompleted,
  });
});

authRoutes.use('/logout', requireAuth);
authRoutes.post('/logout', async (c) => {
  const user = c.get('user');
  await endSession(c);
  const db = createDatabase(c.env.DB);
  await db.insert(auditLogs).values({
    userId: user.id,
    action: 'logout',
    entityType: 'sessions',
    entityId: null,
    changesJson: null,
    ipAddress: getIp(c),
    createdAt: nowIso(),
  });
  return ok(c, { loggedOut: true }, 'ログアウトしました。');
});

authRoutes.use('/me', requireAuth);
authRoutes.get('/me', (c) => ok(c, c.get('user')));

export const setupRoutes = new Hono<AppBindings>();
setupRoutes.use('*', requireAuth);
setupRoutes.post('/', async (c) => {
  const input = await parseJson(c, setupSchema);
  const user = c.get('user');
  const db = createDatabase(c.env.DB);
  const timestamp = nowIso();
  const currentMonth = todayInJapan().slice(0, 7);
  const currentYear = currentMonth.slice(0, 4);
  const statements = [
    db
      .insert(budgets)
      .values({
        userId: user.id,
        budgetType: 'yearly',
        periodKey: currentYear,
        amountYen: input.yearlyBudgetYen,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .onConflictDoUpdate({
        target: [budgets.userId, budgets.budgetType, budgets.periodKey],
        set: { amountYen: input.yearlyBudgetYen, updatedAt: timestamp },
      }),
    db
      .insert(budgets)
      .values({
        userId: user.id,
        budgetType: 'monthly',
        periodKey: currentMonth,
        amountYen: input.monthlyBudgetYen,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .onConflictDoUpdate({
        target: [budgets.userId, budgets.budgetType, budgets.periodKey],
        set: { amountYen: input.monthlyBudgetYen, updatedAt: timestamp },
      }),
    db
      .update(users)
      .set({ setupCompleted: true, updatedAt: timestamp })
      .where(eq(users.id, user.id)),
    db.insert(auditLogs).values({
      userId: user.id,
      action: 'update',
      entityType: 'setup',
      entityId: user.id,
      changesJson: jsonChanges(input),
      ipAddress: getIp(c),
      createdAt: timestamp,
    }),
  ] as const;
  if (input.clubName) {
    await db.batch([
      db
        .insert(clubs)
        .values({
          userId: user.id,
          name: input.clubName,
          status: 'active',
          createdAt: timestamp,
          updatedAt: timestamp,
        })
        .onConflictDoNothing(),
      ...statements,
    ]);
  } else {
    await db.batch(statements);
  }
  return ok(c, { setupCompleted: true }, '初期設定を保存しました。');
});

setupRoutes.get('/defaults', async (c) => {
  const user = c.get('user');
  const db = createDatabase(c.env.DB);
  const rules = await db.select().from(alertRules).where(eq(alertRules.userId, user.id));
  return ok(c, { alertRules: rules });
});
