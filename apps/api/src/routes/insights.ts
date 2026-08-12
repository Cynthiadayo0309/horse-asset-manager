import {
  alertRules,
  auditLogs,
  cashflows,
  createDatabase,
  horseSettlements,
  horses,
  notifications,
  simulationItems,
  simulationScenarios,
  scheduledCashflows,
} from '@horse-asset-manager/database';
import {
  calculateBudgetSummary,
  calculateRecoverySummary,
  calculateSimulation,
  nowIso,
  todayInJapan,
} from '@horse-asset-manager/shared';
import {
  alertRuleUpdateSchema,
  analyticsQuerySchema,
  dashboardQuerySchema,
  exportQuerySchema,
  horseIdParamsSchema,
  idParamsSchema,
  paginationQuerySchema,
  settlementCompleteSchema,
  settlementCreateSchema,
  simulationItemCreateSchema,
  simulationItemUpdateSchema,
  simulationScenarioCreateSchema,
  simulationScenarioUpdateSchema,
} from '@horse-asset-manager/validation';
import { and, asc, count, desc, eq, gte, lte } from 'drizzle-orm';
import { Hono, type Context } from 'hono';

import { requireAuth } from '../lib/auth';
import { ApiError, getIp, jsonChanges, ok, paginated, parseJson, parseValue } from '../lib/http';
import { assertCategory, assertHorse } from '../lib/ownership';
import type { AppBindings } from '../types';

interface AggregateRow {
  id?: number;
  name?: string;
  period?: string;
  expenseYen: number;
  incomeYen: number;
  investmentPrincipalYen: number;
}

export const insightRoutes = new Hono<AppBindings>();
insightRoutes.use('*', requireAuth);

insightRoutes.get('/dashboard/summary', async (c) => {
  const { targetMonth } = parseValue(c.req.query(), dashboardQuerySchema);
  const userId = c.get('user').id;
  const year = targetMonth.slice(0, 4);
  const [actual, scheduled, yearlyActual, yearlyScheduled, budget, unread] = await Promise.all([
    c.env.DB.prepare(
      `SELECT
        COALESCE(SUM(CASE WHEN direction = 'expense' THEN amount_yen ELSE 0 END), 0) AS expenseYen,
        COALESCE(SUM(CASE WHEN direction = 'income' THEN amount_yen ELSE 0 END), 0) AS incomeYen
       FROM cashflows WHERE user_id = ? AND target_month = ? AND status = 'confirmed'`,
    )
      .bind(userId, targetMonth)
      .first<{ expenseYen: number; incomeYen: number }>(),
    c.env.DB.prepare(
      `SELECT COALESCE(SUM(amount_yen), 0) AS amountYen FROM scheduled_cashflows
       WHERE user_id = ? AND target_month = ? AND direction = 'expense' AND status IN ('planned', 'overdue')`,
    )
      .bind(userId, targetMonth)
      .first<{ amountYen: number }>(),
    c.env.DB.prepare(
      `SELECT COALESCE(SUM(amount_yen), 0) AS amountYen FROM cashflows
       WHERE user_id = ? AND target_month LIKE ? AND direction = 'expense' AND status = 'confirmed'`,
    )
      .bind(userId, `${year}%`)
      .first<{ amountYen: number }>(),
    c.env.DB.prepare(
      `SELECT COALESCE(SUM(amount_yen), 0) AS amountYen FROM scheduled_cashflows
       WHERE user_id = ? AND target_month LIKE ? AND direction = 'expense' AND status IN ('planned', 'overdue')`,
    )
      .bind(userId, `${year}%`)
      .first<{ amountYen: number }>(),
    c.env.DB.prepare(
      'SELECT amount_yen AS amountYen FROM budgets WHERE user_id = ? AND budget_type = ? AND period_key = ?',
    )
      .bind(userId, 'yearly', year)
      .first<{ amountYen: number }>(),
    c.env.DB.prepare(
      'SELECT COUNT(*) AS value FROM notifications WHERE user_id = ? AND is_read = 0',
    )
      .bind(userId)
      .first<{ value: number }>(),
  ]);
  const annual = calculateBudgetSummary({
    budgetYen: budget?.amountYen ?? null,
    actualExpenseYen: yearlyActual?.amountYen ?? 0,
    outstandingScheduledExpenseYen: yearlyScheduled?.amountYen ?? 0,
  });
  return ok(c, {
    targetMonth,
    scheduledExpenseYen: scheduled?.amountYen ?? 0,
    actualExpenseYen: actual?.expenseYen ?? 0,
    incomeYen: actual?.incomeYen ?? 0,
    netYen: (actual?.incomeYen ?? 0) - (actual?.expenseYen ?? 0),
    yearlyProjectedExpenseYen: annual.projectedExpenseYen,
    yearlyRemainingBudgetYen: annual.remainingBudgetYen,
    availableInvestmentYen: annual.availableInvestmentYen,
    budgetUsageRate: annual.usageRate,
    isOverBudget: annual.isOverBudget,
    unreadNotifications: unread?.value ?? 0,
  });
});

insightRoutes.get('/budgets/available-investment', async (c) => {
  const year = c.req.query('year') ?? todayInJapan().slice(0, 4);
  if (!/^\d{4}$/u.test(year))
    throw new ApiError(400, 'VALIDATION_ERROR', '年はYYYY形式で指定してください。');
  const userId = c.get('user').id;
  const [budget, actual, scheduled] = await Promise.all([
    c.env.DB.prepare(
      'SELECT amount_yen AS amountYen FROM budgets WHERE user_id = ? AND budget_type = ? AND period_key = ?',
    )
      .bind(userId, 'yearly', year)
      .first<{ amountYen: number }>(),
    c.env.DB.prepare(
      "SELECT COALESCE(SUM(amount_yen), 0) AS amountYen FROM cashflows WHERE user_id = ? AND direction = 'expense' AND status = 'confirmed' AND target_month LIKE ?",
    )
      .bind(userId, `${year}%`)
      .first<{ amountYen: number }>(),
    c.env.DB.prepare(
      "SELECT COALESCE(SUM(amount_yen), 0) AS amountYen FROM scheduled_cashflows WHERE user_id = ? AND direction = 'expense' AND status IN ('planned','overdue') AND target_month LIKE ?",
    )
      .bind(userId, `${year}%`)
      .first<{ amountYen: number }>(),
  ]);
  return ok(
    c,
    calculateBudgetSummary({
      budgetYen: budget?.amountYen ?? null,
      actualExpenseYen: actual?.amountYen ?? 0,
      outstandingScheduledExpenseYen: scheduled?.amountYen ?? 0,
    }),
  );
});

insightRoutes.get('/analytics/by-horse', (c) => analytics(c, 'horse'));
insightRoutes.get('/analytics/by-club', (c) => analytics(c, 'club'));
insightRoutes.get('/analytics/by-category', (c) => analytics(c, 'category'));
insightRoutes.get('/analytics/monthly', (c) => analytics(c, 'month'));

insightRoutes.get('/analytics/recovery-rates', async (c) => {
  const query = parseValue(c.req.query(), analyticsQuerySchema);
  const rows = await aggregate(c, 'horse', query.from, query.to);
  return ok(c, rows.map(toRecoveryRow));
});

insightRoutes.get('/calendar', async (c) => {
  const query = parseValue(c.req.query(), analyticsQuerySchema);
  const rows = await createDatabase(c.env.DB)
    .select()
    .from(scheduledCashflows)
    .where(
      and(
        eq(scheduledCashflows.userId, c.get('user').id),
        gte(scheduledCashflows.dueOn, query.from),
        lte(scheduledCashflows.dueOn, query.to),
      ),
    )
    .orderBy(asc(scheduledCashflows.dueOn))
    .limit(500);
  return ok(c, rows);
});

insightRoutes.get('/horses/:horseId/ledger', async (c) => {
  const { horseId } = parseValue(c.req.param(), horseIdParamsSchema);
  await assertHorse(c, horseId);
  const from = c.req.query('from') ?? '1900-01-01';
  const to = c.req.query('to') ?? '2999-12-31';
  const row = await c.env.DB.prepare(
    `SELECT
      COALESCE(SUM(CASE WHEN cf.direction = 'expense' THEN cf.amount_yen ELSE 0 END), 0) AS expenseYen,
      COALESCE(SUM(CASE WHEN cf.direction = 'income' THEN cf.amount_yen ELSE 0 END), 0) AS incomeYen,
      COALESCE(SUM(CASE WHEN cf.direction = 'expense' AND cat.system_code = 'investment_principal' THEN cf.amount_yen ELSE 0 END), 0) AS investmentPrincipalYen
     FROM cashflows cf JOIN categories cat ON cat.id = cf.category_id
     WHERE cf.user_id = ? AND cf.horse_id = ? AND cf.status = 'confirmed' AND cf.occurred_on BETWEEN ? AND ?`,
  )
    .bind(c.get('user').id, horseId, from, to)
    .first<AggregateRow>();
  const recent = await createDatabase(c.env.DB)
    .select()
    .from(cashflows)
    .where(
      and(
        eq(cashflows.userId, c.get('user').id),
        eq(cashflows.horseId, horseId),
        eq(cashflows.status, 'confirmed'),
      ),
    )
    .orderBy(desc(cashflows.occurredOn))
    .limit(100);
  return ok(c, {
    summary: calculateRecoverySummary(
      row ?? { expenseYen: 0, incomeYen: 0, investmentPrincipalYen: 0 },
    ),
    cashflows: recent,
  });
});

insightRoutes.get('/simulations', async (c) => {
  const { page, pageSize } = parseValue(c.req.query(), paginationQuerySchema);
  const userId = c.get('user').id;
  const db = createDatabase(c.env.DB);
  const where = and(
    eq(simulationScenarios.userId, userId),
    eq(simulationScenarios.status, 'active'),
  );
  const [rows, totals] = await Promise.all([
    db
      .select()
      .from(simulationScenarios)
      .where(where)
      .orderBy(desc(simulationScenarios.updatedAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ value: count() }).from(simulationScenarios).where(where),
  ]);
  return paginated(c, rows, { page, pageSize, total: totals[0]?.value ?? 0 });
});

insightRoutes.post('/simulations', async (c) => {
  const input = await parseJson(c, simulationScenarioCreateSchema);
  const user = c.get('user');
  const db = createDatabase(c.env.DB);
  const timestamp = nowIso();
  const [created] = await db.batch([
    db
      .insert(simulationScenarios)
      .values({
        userId: user.id,
        ...input,
        status: 'active',
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .returning(),
    db.insert(auditLogs).values({
      userId: user.id,
      action: 'create',
      entityType: 'simulation_scenarios',
      entityId: null,
      changesJson: jsonChanges(input),
      ipAddress: getIp(c),
      createdAt: timestamp,
    }),
  ]);
  return ok(c, created[0], 'シミュレーションを作成しました。', 201);
});

insightRoutes.get('/simulations/:id', async (c) => {
  const scenario = await findScenario(c);
  const items = await createDatabase(c.env.DB)
    .select()
    .from(simulationItems)
    .where(
      and(
        eq(simulationItems.userId, c.get('user').id),
        eq(simulationItems.scenarioId, scenario.id),
      ),
    )
    .orderBy(asc(simulationItems.id));
  return ok(c, { ...scenario, items });
});

insightRoutes.patch('/simulations/:id', async (c) => {
  const scenario = await findScenario(c);
  const input = await parseJson(c, simulationScenarioUpdateSchema);
  const db = createDatabase(c.env.DB);
  const updated = await db
    .update(simulationScenarios)
    .set({ ...input, updatedAt: nowIso() })
    .where(
      and(
        eq(simulationScenarios.id, scenario.id),
        eq(simulationScenarios.userId, c.get('user').id),
      ),
    )
    .returning();
  return ok(c, updated[0], 'シミュレーションを更新しました。');
});

insightRoutes.delete('/simulations/:id', async (c) => {
  const scenario = await findScenario(c);
  const updated = await createDatabase(c.env.DB)
    .update(simulationScenarios)
    .set({ status: 'archived', updatedAt: nowIso() })
    .where(eq(simulationScenarios.id, scenario.id))
    .returning();
  return ok(c, updated[0], 'シミュレーションをアーカイブしました。');
});

insightRoutes.post('/simulations/:id/items', async (c) => {
  const scenario = await findScenario(c);
  const input = await parseJson(c, simulationItemCreateSchema);
  if (input.horseId) await assertHorse(c, input.horseId);
  const timestamp = nowIso();
  const created = await createDatabase(c.env.DB)
    .insert(simulationItems)
    .values({
      userId: c.get('user').id,
      scenarioId: scenario.id,
      ...input,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .returning();
  return ok(c, created[0], '候補を追加しました。', 201);
});

insightRoutes.patch('/simulations/:id/items/:itemId', async (c) => {
  const scenario = await findScenario(c);
  const itemId = Number(c.req.param('itemId'));
  const input = await parseJson(c, simulationItemUpdateSchema);
  const db = createDatabase(c.env.DB);
  const existing = await db
    .select()
    .from(simulationItems)
    .where(
      and(
        eq(simulationItems.id, itemId),
        eq(simulationItems.scenarioId, scenario.id),
        eq(simulationItems.userId, c.get('user').id),
      ),
    )
    .limit(1);
  if (!existing[0]) throw new ApiError(404, 'SIMULATION_ITEM_NOT_FOUND', '候補が見つかりません。');
  const updated = await db
    .update(simulationItems)
    .set({ ...input, updatedAt: nowIso() })
    .where(eq(simulationItems.id, itemId))
    .returning();
  return ok(c, updated[0], '候補を更新しました。');
});

insightRoutes.delete('/simulations/:id/items/:itemId', async (c) => {
  const scenario = await findScenario(c);
  const itemId = Number(c.req.param('itemId'));
  await createDatabase(c.env.DB)
    .delete(simulationItems)
    .where(
      and(
        eq(simulationItems.id, itemId),
        eq(simulationItems.scenarioId, scenario.id),
        eq(simulationItems.userId, c.get('user').id),
      ),
    );
  return ok(c, { id: itemId }, '候補を削除しました。');
});

insightRoutes.get('/simulations/:id/result', async (c) => {
  const scenario = await findScenario(c);
  const items = await createDatabase(c.env.DB)
    .select()
    .from(simulationItems)
    .where(
      and(
        eq(simulationItems.scenarioId, scenario.id),
        eq(simulationItems.userId, c.get('user').id),
      ),
    );
  const result = calculateSimulation(items, scenario.assumedPeriodMonths);
  const year = scenario.startMonth.slice(0, 4);
  const budgetResponse = await budgetForYear(c, year);
  const remainingAfterScenarioYen =
    budgetResponse.remainingBudgetYen == null
      ? null
      : budgetResponse.remainingBudgetYen - result.firstYearTotalYen;
  return ok(c, {
    ...result,
    annualBudgetYen: budgetResponse.budgetYen,
    remainingBudgetYen: remainingAfterScenarioYen,
    isOverBudget: remainingAfterScenarioYen != null && remainingAfterScenarioYen < 0,
  });
});

insightRoutes.get('/horses/:horseId/settlements', async (c) => {
  const { horseId } = parseValue(c.req.param(), horseIdParamsSchema);
  await assertHorse(c, horseId);
  const rows = await createDatabase(c.env.DB)
    .select()
    .from(horseSettlements)
    .where(
      and(eq(horseSettlements.userId, c.get('user').id), eq(horseSettlements.horseId, horseId)),
    )
    .orderBy(asc(horseSettlements.plannedOn));
  return ok(c, rows);
});

insightRoutes.post('/horses/:horseId/settlements', async (c) => {
  const { horseId } = parseValue(c.req.param(), horseIdParamsSchema);
  await assertHorse(c, horseId);
  const input = await parseJson(c, settlementCreateSchema);
  const timestamp = nowIso();
  const db = createDatabase(c.env.DB);
  const [created] = await db.batch([
    db
      .insert(horseSettlements)
      .values({
        userId: c.get('user').id,
        horseId,
        ...input,
        status: 'planned',
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .returning(),
    db.insert(auditLogs).values({
      userId: c.get('user').id,
      action: 'create',
      entityType: 'horse_settlements',
      entityId: null,
      subjectHorseId: horseId,
      changesJson: jsonChanges(input),
      ipAddress: getIp(c),
      createdAt: timestamp,
    }),
  ]);
  return ok(c, created[0], '精算予定を登録しました。', 201);
});

insightRoutes.post('/settlements/:id/complete', async (c) => {
  const { id } = parseValue(c.req.param(), idParamsSchema);
  const input = await parseJson(c, settlementCompleteSchema);
  const category = await assertCategory(c, input.categoryId);
  const user = c.get('user');
  const db = createDatabase(c.env.DB);
  const rows = await db
    .select()
    .from(horseSettlements)
    .where(and(eq(horseSettlements.id, id), eq(horseSettlements.userId, user.id)))
    .limit(1);
  const settlement = rows[0];
  if (!settlement) throw new ApiError(404, 'SETTLEMENT_NOT_FOUND', '精算予定が見つかりません。');
  if (settlement.status !== 'planned' || settlement.cashflowId != null) {
    throw settlementAlreadyCompletedError();
  }
  if (category?.categoryType !== settlement.direction)
    throw new ApiError(409, 'CATEGORY_DIRECTION_MISMATCH', 'カテゴリーの種別が一致しません。');
  const timestamp = nowIso();
  try {
    await c.env.DB.batch([
      c.env.DB.prepare(
        `INSERT INTO cashflows (user_id, horse_id, category_id, idempotency_key, direction, title, amount_yen, occurred_on, target_month, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', ?, ?)`,
      ).bind(
        user.id,
        settlement.horseId,
        input.categoryId,
        `settlement:${id}`,
        settlement.direction,
        settlementTitle(settlement.settlementType),
        settlement.amountYen,
        input.settledOn,
        input.settledOn.slice(0, 7),
        timestamp,
        timestamp,
      ),
      c.env.DB.prepare(
        "UPDATE horse_settlements SET cashflow_id = last_insert_rowid(), settled_on = ?, status = ?, updated_at = ? WHERE id = ? AND user_id = ? AND status = 'planned' AND cashflow_id IS NULL",
      ).bind(
        input.settledOn,
        settlement.direction === 'income' ? 'received' : 'paid',
        timestamp,
        id,
        user.id,
      ),
      c.env.DB.prepare(
        "INSERT INTO audit_logs (user_id, action, entity_type, entity_id, subject_horse_id, changes_json, ip_address, created_at) VALUES (?, 'update', 'horse_settlements', ?, ?, ?, ?, ?)",
      ).bind(user.id, id, settlement.horseId, jsonChanges(input), getIp(c), timestamp),
    ]);
  } catch (error) {
    if (isSettlementIdempotencyError(error)) throw settlementAlreadyCompletedError();
    throw error;
  }
  const updated = await db
    .select()
    .from(horseSettlements)
    .where(and(eq(horseSettlements.id, id), eq(horseSettlements.userId, user.id)))
    .limit(1);
  return ok(c, updated[0], '精算を実績収支へ登録しました。');
});

insightRoutes.post('/horses/:horseId/mark-settled', async (c) => {
  const { horseId } = parseValue(c.req.param(), horseIdParamsSchema);
  const horse = await assertHorse(c, horseId);
  if (horse?.status !== 'settling') {
    throw new ApiError(409, 'HORSE_NOT_SETTLING', '精算中の馬だけ精算完了にできます。');
  }
  const db = createDatabase(c.env.DB);
  const pending = await db
    .select({ value: count() })
    .from(horseSettlements)
    .where(
      and(
        eq(horseSettlements.userId, c.get('user').id),
        eq(horseSettlements.horseId, horseId),
        eq(horseSettlements.status, 'planned'),
      ),
    );
  if ((pending[0]?.value ?? 0) > 0)
    throw new ApiError(409, 'SETTLEMENTS_PENDING', '未処理の精算予定があります。');
  const settledOn = todayInJapan();
  const timestamp = nowIso();
  const [updated] = await db.batch([
    db
      .update(horses)
      .set({ status: 'settled', settledOn, updatedAt: timestamp })
      .where(and(eq(horses.id, horse?.id ?? horseId), eq(horses.userId, c.get('user').id)))
      .returning(),
    db.insert(auditLogs).values({
      userId: c.get('user').id,
      action: 'update',
      entityType: 'horses',
      entityId: horseId,
      subjectHorseId: horseId,
      changesJson: jsonChanges({ status: 'settled', settledOn }),
      ipAddress: getIp(c),
      createdAt: timestamp,
    }),
  ]);
  return ok(c, updated[0], '精算完了にしました。');
});

insightRoutes.get('/notifications', async (c) => {
  const { page, pageSize } = parseValue(c.req.query(), paginationQuerySchema);
  const userId = c.get('user').id;
  const db = createDatabase(c.env.DB);
  const where = eq(notifications.userId, userId);
  const [rows, totals] = await Promise.all([
    db
      .select()
      .from(notifications)
      .where(where)
      .orderBy(desc(notifications.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ value: count() }).from(notifications).where(where),
  ]);
  return paginated(c, rows, { page, pageSize, total: totals[0]?.value ?? 0 });
});

insightRoutes.patch('/notifications/:id/read', async (c) => {
  const { id } = parseValue(c.req.param(), idParamsSchema);
  const updated = await createDatabase(c.env.DB)
    .update(notifications)
    .set({ isRead: true, readAt: nowIso() })
    .where(and(eq(notifications.id, id), eq(notifications.userId, c.get('user').id)))
    .returning();
  if (!updated[0]) throw new ApiError(404, 'NOTIFICATION_NOT_FOUND', '通知が見つかりません。');
  return ok(c, updated[0], '既読にしました。');
});

insightRoutes.get('/alert-rules', async (c) => {
  const rows = await createDatabase(c.env.DB)
    .select()
    .from(alertRules)
    .where(eq(alertRules.userId, c.get('user').id))
    .orderBy(asc(alertRules.id));
  return ok(
    c,
    rows.map((row) => ({ ...row, condition: JSON.parse(row.conditionJson) as unknown })),
  );
});

insightRoutes.patch('/alert-rules/:id', async (c) => {
  const { id } = parseValue(c.req.param(), idParamsSchema);
  const input = await parseJson(c, alertRuleUpdateSchema);
  const updated = await createDatabase(c.env.DB)
    .update(alertRules)
    .set({
      conditionJson: JSON.stringify(input.condition),
      isEnabled: input.isEnabled,
      updatedAt: nowIso(),
    })
    .where(and(eq(alertRules.id, id), eq(alertRules.userId, c.get('user').id)))
    .returning();
  if (!updated[0])
    throw new ApiError(404, 'ALERT_RULE_NOT_FOUND', 'アラート設定が見つかりません。');
  return ok(c, updated[0], 'アラート設定を更新しました。');
});

insightRoutes.get('/export/cashflows.csv', async (c) => exportCashflows(c));
insightRoutes.get('/export/analytics-by-horse.csv', async (c) => exportAnalytics(c, 'horse'));
insightRoutes.get('/export/analytics-by-club.csv', async (c) => exportAnalytics(c, 'club'));
insightRoutes.get('/export/analytics-monthly.csv', async (c) => exportAnalytics(c, 'month'));
insightRoutes.get('/export/analytics-yearly.csv', async (c) => exportAnalytics(c, 'year'));

async function analytics(c: Context<AppBindings>, group: 'horse' | 'club' | 'category' | 'month') {
  const query = parseValue(c.req.query(), analyticsQuerySchema);
  return ok(c, (await aggregate(c, group, query.from, query.to)).map(toRecoveryRow));
}

async function aggregate(
  c: Context<AppBindings>,
  group: 'horse' | 'club' | 'category' | 'month' | 'year',
  from: string,
  to: string,
): Promise<AggregateRow[]> {
  const expressions = {
    horse: {
      select: "COALESCE(h.id, 0) AS id, COALESCE(h.name, '未設定') AS name",
      join: 'LEFT JOIN horses h ON h.id = cf.horse_id',
      group: 'h.id, h.name',
    },
    club: {
      select: "COALESCE(cl.id, 0) AS id, COALESCE(cl.name, '未設定') AS name",
      join: 'LEFT JOIN clubs cl ON cl.id = cf.club_id',
      group: 'cl.id, cl.name',
    },
    category: { select: 'cat.id AS id, cat.name AS name', join: '', group: 'cat.id, cat.name' },
    month: { select: 'cf.target_month AS period', join: '', group: 'cf.target_month' },
    year: {
      select: 'SUBSTR(cf.target_month, 1, 4) AS period',
      join: '',
      group: 'SUBSTR(cf.target_month, 1, 4)',
    },
  }[group];
  const result = await c.env.DB.prepare(
    `SELECT ${expressions.select},
      COALESCE(SUM(CASE WHEN cf.direction = 'expense' THEN cf.amount_yen ELSE 0 END), 0) AS expenseYen,
      COALESCE(SUM(CASE WHEN cf.direction = 'income' THEN cf.amount_yen ELSE 0 END), 0) AS incomeYen,
      COALESCE(SUM(CASE WHEN cf.direction = 'expense' AND cat.system_code = 'investment_principal' THEN cf.amount_yen ELSE 0 END), 0) AS investmentPrincipalYen
     FROM cashflows cf JOIN categories cat ON cat.id = cf.category_id ${expressions.join}
     WHERE cf.user_id = ? AND cf.status = 'confirmed' AND cf.occurred_on BETWEEN ? AND ?
     GROUP BY ${expressions.group} ORDER BY ${group === 'month' || group === 'year' ? 'period' : 'name'} LIMIT 1000`,
  )
    .bind(c.get('user').id, from, to)
    .all<AggregateRow>();
  return result.results;
}

function toRecoveryRow(row: AggregateRow) {
  return { id: row.id, name: row.name, period: row.period, ...calculateRecoverySummary(row) };
}

async function findScenario(c: Context<AppBindings>) {
  const { id } = parseValue(c.req.param(), idParamsSchema);
  const rows = await createDatabase(c.env.DB)
    .select()
    .from(simulationScenarios)
    .where(
      and(
        eq(simulationScenarios.id, id),
        eq(simulationScenarios.userId, c.get('user').id),
        eq(simulationScenarios.status, 'active'),
      ),
    )
    .limit(1);
  if (!rows[0])
    throw new ApiError(404, 'SIMULATION_NOT_FOUND', 'シミュレーションが見つかりません。');
  return rows[0];
}

async function budgetForYear(c: Context<AppBindings>, year: string) {
  const userId = c.get('user').id;
  const [budget, actual, scheduled] = await Promise.all([
    c.env.DB.prepare(
      "SELECT amount_yen AS amountYen FROM budgets WHERE user_id = ? AND budget_type = 'yearly' AND period_key = ?",
    )
      .bind(userId, year)
      .first<{ amountYen: number }>(),
    c.env.DB.prepare(
      "SELECT COALESCE(SUM(amount_yen),0) AS amountYen FROM cashflows WHERE user_id = ? AND direction = 'expense' AND status = 'confirmed' AND target_month LIKE ?",
    )
      .bind(userId, `${year}%`)
      .first<{ amountYen: number }>(),
    c.env.DB.prepare(
      "SELECT COALESCE(SUM(amount_yen),0) AS amountYen FROM scheduled_cashflows WHERE user_id = ? AND direction = 'expense' AND status IN ('planned','overdue') AND target_month LIKE ?",
    )
      .bind(userId, `${year}%`)
      .first<{ amountYen: number }>(),
  ]);
  return calculateBudgetSummary({
    budgetYen: budget?.amountYen ?? null,
    actualExpenseYen: actual?.amountYen ?? 0,
    outstandingScheduledExpenseYen: scheduled?.amountYen ?? 0,
  });
}

function settlementTitle(type: string): string {
  return (
    (
      {
        final_cost: '最終維持費',
        sale_proceeds: '売却代金',
        insurance: '保険金',
        refund: '返還金',
        retirement_settlement: '引退精算金',
        other: 'その他精算',
      } as Record<string, string>
    )[type] ?? '精算'
  );
}

function csvCell(value: unknown): string {
  const raw = String(value ?? '');
  const safe = typeof value === 'string' && /^[\t\r\n ]*[=+\-@]/u.test(raw) ? `'${raw}` : raw;
  return `"${safe.replaceAll('"', '""')}"`;
}

function settlementAlreadyCompletedError() {
  return new ApiError(
    409,
    'SETTLEMENT_ALREADY_COMPLETED',
    'この精算はすでに実績収支へ登録されています。',
  );
}

function isSettlementIdempotencyError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.message.includes('uq_cashflows_user_idempotency_key') ||
      error.message.includes('cashflows.user_id, cashflows.idempotency_key'))
  );
}

function csvResponse(
  c: Context<AppBindings>,
  filename: string,
  headers: string[],
  rows: unknown[][],
) {
  const content = `\uFEFF${[headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
  return c.body(content, 200, {
    'content-type': 'text/csv; charset=utf-8',
    'content-disposition': `attachment; filename="${filename}"`,
  });
}

async function exportCashflows(c: Context<AppBindings>) {
  const query = parseValue(c.req.query(), exportQuerySchema);
  const result = await c.env.DB.prepare(
    `SELECT cf.occurred_on, cf.target_month, cf.direction, cf.title, cf.amount_yen, cat.name AS category_name, h.name AS horse_name, cl.name AS club_name, cf.note
     FROM cashflows cf JOIN categories cat ON cat.id = cf.category_id LEFT JOIN horses h ON h.id = cf.horse_id LEFT JOIN clubs cl ON cl.id = cf.club_id
     WHERE cf.user_id = ? AND cf.status = 'confirmed' AND cf.occurred_on BETWEEN ? AND ? ORDER BY cf.occurred_on, cf.id LIMIT 50001`,
  )
    .bind(c.get('user').id, query.from, query.to)
    .all<Record<string, unknown>>();
  if (result.results.length > 50_000)
    throw new ApiError(422, 'CSV_TOO_LARGE', 'CSVは50,000行以内の期間を指定してください。');
  return csvResponse(
    c,
    `cashflows-${query.from}-${query.to}.csv`,
    ['発生日', '対象年月', '種別', 'タイトル', '金額（円）', 'カテゴリー', '馬', 'クラブ', 'メモ'],
    result.results.map((row) => [
      row.occurred_on,
      row.target_month,
      row.direction === 'expense' ? '支出' : '入金',
      row.title,
      row.amount_yen,
      row.category_name,
      row.horse_name,
      row.club_name,
      row.note,
    ]),
  );
}

async function exportAnalytics(
  c: Context<AppBindings>,
  group: 'horse' | 'club' | 'month' | 'year',
) {
  const query = parseValue(c.req.query(), exportQuerySchema);
  const rows = (await aggregate(c, group, query.from, query.to)).map(toRecoveryRow);
  return csvResponse(
    c,
    `analytics-${group}-${query.from}-${query.to}.csv`,
    ['集計対象', '支出（円）', '入金（円）', '差引（円）', '馬代回収率（%）', '総合回収率（%）'],
    rows.map((row) => [
      row.name ?? row.period,
      row.expenseYen,
      row.incomeYen,
      row.profitLossYen,
      row.principalRecoveryRate,
      row.totalRecoveryRate,
    ]),
  );
}
