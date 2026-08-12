import {
  auditLogs,
  cashflowReconciliations,
  cashflows,
  createDatabase,
  recurringRules,
  scheduledCashflows,
} from '@horse-asset-manager/database';
import { nowIso, todayInJapan } from '@horse-asset-manager/shared';
import {
  cashflowCreateSchema,
  cashflowListQuerySchema,
  cashflowUpdateSchema,
  dashboardQuerySchema,
  idParamsSchema,
  paginationQuerySchema,
  reconciliationCreateSchema,
  reconciliationUpdateSchema,
  recurringRuleCreateSchema,
  recurringRuleUpdateSchema,
  scheduledCashflowCreateSchema,
  scheduledCashflowUpdateSchema,
  scheduledListQuerySchema,
} from '@horse-asset-manager/validation';
import { and, asc, count, desc, eq, gte, lte, or, type SQL } from 'drizzle-orm';
import { Hono, type Context } from 'hono';

import { requireAuth } from '../lib/auth';
import { ApiError, getIp, jsonChanges, ok, paginated, parseJson, parseValue } from '../lib/http';
import { assertCategory, assertClub, assertHorse } from '../lib/ownership';
import {
  generateSchedulesForRule,
  prepareScheduleStatements,
  scheduleHorizon,
  type RecurringRule,
} from '../services/schedules';
import type { AppBindings } from '../types';

export const cashflowRoutes = new Hono<AppBindings>();
cashflowRoutes.use('*', requireAuth);

cashflowRoutes.get('/cashflows', async (c) => {
  const query = parseValue(c.req.query(), cashflowListQuerySchema);
  const userId = c.get('user').id;
  const db = createDatabase(c.env.DB);
  const conditions: SQL[] = [eq(cashflows.userId, userId), eq(cashflows.status, 'confirmed')];
  if (query.targetMonth) conditions.push(eq(cashflows.targetMonth, query.targetMonth));
  if (query.from) conditions.push(gte(cashflows.occurredOn, query.from));
  if (query.to) conditions.push(lte(cashflows.occurredOn, query.to));
  if (query.horseId) conditions.push(eq(cashflows.horseId, query.horseId));
  if (query.clubId) conditions.push(eq(cashflows.clubId, query.clubId));
  if (query.categoryId) conditions.push(eq(cashflows.categoryId, query.categoryId));
  if (query.direction) conditions.push(eq(cashflows.direction, query.direction));
  const where = and(...conditions);
  const [rows, totals] = await Promise.all([
    db
      .select()
      .from(cashflows)
      .where(where)
      .orderBy(desc(cashflows.occurredOn), desc(cashflows.id))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize),
    db.select({ value: count() }).from(cashflows).where(where),
  ]);
  return paginated(c, rows, {
    page: query.page,
    pageSize: query.pageSize,
    total: totals[0]?.value ?? 0,
  });
});

cashflowRoutes.get('/cashflows/:id', async (c) => {
  const { id } = parseValue(c.req.param(), idParamsSchema);
  const row = await findCashflow(c, id);
  return ok(c, row);
});

cashflowRoutes.post('/cashflows', async (c) => {
  const input = await parseJson(c, cashflowCreateSchema);
  const category = await assertCategory(c, input.categoryId);
  if (category?.categoryType !== input.direction)
    throw new ApiError(
      409,
      'CATEGORY_DIRECTION_MISMATCH',
      'カテゴリーの種別が支出・入金と一致しません。',
    );
  if (input.horseId) await assertHorse(c, input.horseId);
  if (input.clubId) await assertClub(c, input.clubId);
  const user = c.get('user');
  const db = createDatabase(c.env.DB);
  const timestamp = nowIso();
  const { scheduledCashflowId, ...record } = input;
  if (scheduledCashflowId) {
    const scheduled = await findScheduled(c, scheduledCashflowId);
    if (scheduled.direction !== input.direction)
      throw new ApiError(409, 'DIRECTION_MISMATCH', '予定と実績の種別が一致しません。');
    const [created] = await db.batch([
      db
        .insert(cashflows)
        .values({
          userId: user.id,
          ...record,
          status: 'confirmed',
          createdAt: timestamp,
          updatedAt: timestamp,
        })
        .returning(),
      db.insert(auditLogs).values({
        userId: user.id,
        action: 'create',
        entityType: 'cashflows',
        entityId: null,
        subjectHorseId: record.horseId ?? null,
        changesJson: jsonChanges(record),
        ipAddress: getIp(c),
        createdAt: timestamp,
      }),
    ]);
    const createdRow = created[0];
    if (!createdRow) throw new ApiError(422, 'CREATE_FAILED', '収支を登録できませんでした。');
    await createReconciliation(c, scheduledCashflowId, createdRow.id, null);
    return ok(c, createdRow, '収支を登録して予定と照合しました。', 201);
  }
  const [created] = await db.batch([
    db
      .insert(cashflows)
      .values({
        userId: user.id,
        ...record,
        status: 'confirmed',
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .returning(),
    db.insert(auditLogs).values({
      userId: user.id,
      action: 'create',
      entityType: 'cashflows',
      entityId: null,
      subjectHorseId: record.horseId ?? null,
      changesJson: jsonChanges(record),
      ipAddress: getIp(c),
      createdAt: timestamp,
    }),
  ]);
  return ok(c, created[0], '収支を登録しました。', 201);
});

cashflowRoutes.patch('/cashflows/:id', async (c) => {
  const { id } = parseValue(c.req.param(), idParamsSchema);
  const input = await parseJson(c, cashflowUpdateSchema);
  const current = await findCashflow(c, id);
  if (input.categoryId) {
    const category = await assertCategory(c, input.categoryId);
    const direction = input.direction ?? current.direction;
    if (category?.categoryType !== direction)
      throw new ApiError(409, 'CATEGORY_DIRECTION_MISMATCH', 'カテゴリーの種別が一致しません。');
  }
  if (input.horseId) await assertHorse(c, input.horseId);
  if (input.clubId) await assertClub(c, input.clubId);
  const user = c.get('user');
  const db = createDatabase(c.env.DB);
  const timestamp = nowIso();
  const [updated] = await db.batch([
    db
      .update(cashflows)
      .set({ ...input, updatedAt: timestamp })
      .where(and(eq(cashflows.id, id), eq(cashflows.userId, user.id)))
      .returning(),
    db.insert(auditLogs).values({
      userId: user.id,
      action: 'update',
      entityType: 'cashflows',
      entityId: id,
      subjectHorseId: input.horseId === undefined ? current.horseId : input.horseId,
      changesJson: jsonChanges(input),
      ipAddress: getIp(c),
      createdAt: timestamp,
    }),
  ]);
  await refreshReconciliationDifference(
    db,
    user.id,
    id,
    updated[0]?.amountYen ?? current.amountYen,
  );
  return ok(c, updated[0], '収支を更新しました。');
});

cashflowRoutes.delete('/cashflows/:id', async (c) => {
  const { id } = parseValue(c.req.param(), idParamsSchema);
  const current = await findCashflow(c, id);
  const user = c.get('user');
  const db = createDatabase(c.env.DB);
  const timestamp = nowIso();
  const reconciliation = await db
    .select()
    .from(cashflowReconciliations)
    .where(
      and(eq(cashflowReconciliations.userId, user.id), eq(cashflowReconciliations.cashflowId, id)),
    )
    .limit(1);
  const queries = [
    db
      .update(cashflows)
      .set({ status: 'archived', updatedAt: timestamp })
      .where(and(eq(cashflows.id, id), eq(cashflows.userId, user.id)))
      .returning(),
    db.insert(auditLogs).values({
      userId: user.id,
      action: 'archive',
      entityType: 'cashflows',
      entityId: id,
      subjectHorseId: current.horseId,
      changesJson: null,
      ipAddress: getIp(c),
      createdAt: timestamp,
    }),
  ] as const;
  if (reconciliation[0]?.scheduledCashflowId) {
    const restoredStatus =
      (await findScheduled(c, reconciliation[0].scheduledCashflowId)).dueOn < todayInJapan()
        ? ('overdue' as const)
        : ('planned' as const);
    const [updated] = await db.batch([
      ...queries,
      db
        .delete(cashflowReconciliations)
        .where(
          and(
            eq(cashflowReconciliations.id, reconciliation[0].id),
            eq(cashflowReconciliations.userId, user.id),
          ),
        ),
      db
        .update(scheduledCashflows)
        .set({ status: restoredStatus, updatedAt: timestamp })
        .where(
          and(
            eq(scheduledCashflows.id, reconciliation[0].scheduledCashflowId),
            eq(scheduledCashflows.userId, user.id),
          ),
        ),
    ]);
    return ok(c, updated[0], '収支をアーカイブしました。');
  }
  const [updated] = await db.batch(queries);
  return ok(c, updated[0], '収支をアーカイブしました。');
});

cashflowRoutes.get('/recurring-rules', async (c) => {
  const { page, pageSize } = parseValue(c.req.query(), paginationQuerySchema);
  const userId = c.get('user').id;
  const db = createDatabase(c.env.DB);
  const where = and(eq(recurringRules.userId, userId), eq(recurringRules.status, 'active'));
  const [rows, totals] = await Promise.all([
    db
      .select()
      .from(recurringRules)
      .where(where)
      .orderBy(asc(recurringRules.title))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ value: count() }).from(recurringRules).where(where),
  ]);
  return paginated(c, rows, { page, pageSize, total: totals[0]?.value ?? 0 });
});

cashflowRoutes.post('/recurring-rules', async (c) => {
  const input = await parseJson(c, recurringRuleCreateSchema);
  const category = await assertCategory(c, input.categoryId);
  if (category?.categoryType !== input.direction)
    throw new ApiError(409, 'CATEGORY_DIRECTION_MISMATCH', 'カテゴリーの種別が一致しません。');
  if (input.horseId) await assertHorse(c, input.horseId);
  if (input.clubId) await assertClub(c, input.clubId);
  const user = c.get('user');
  const timestamp = nowIso();
  const throughMonth = scheduleHorizon(todayInJapan().slice(0, 7));
  const rule: RecurringRule = {
    id: randomDatabaseId(),
    userId: user.id,
    horseId: input.horseId ?? null,
    clubId: input.clubId ?? null,
    categoryId: input.categoryId,
    direction: input.direction,
    title: input.title,
    amountYen: input.amountYen,
    frequency: input.frequency,
    dayOfMonth: input.dayOfMonth,
    startMonth: input.startMonth,
    endMonth: input.endMonth ?? null,
    generatedThroughMonth: throughMonth,
    status: 'active',
    note: input.note ?? null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  const schedules = prepareScheduleStatements(c.env.DB, rule, throughMonth, timestamp);
  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO recurring_rules
         (id, user_id, horse_id, club_id, category_id, direction, title, amount_yen, frequency, day_of_month, start_month, end_month, generated_through_month, status, note, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)`,
    ).bind(
      rule.id,
      rule.userId,
      rule.horseId,
      rule.clubId,
      rule.categoryId,
      rule.direction,
      rule.title,
      rule.amountYen,
      rule.frequency,
      rule.dayOfMonth,
      rule.startMonth,
      rule.endMonth,
      rule.generatedThroughMonth,
      rule.note,
      rule.createdAt,
      rule.updatedAt,
    ),
    ...schedules.statements,
    c.env.DB.prepare(
      `INSERT INTO audit_logs
         (user_id, action, entity_type, entity_id, subject_horse_id, changes_json, ip_address, created_at)
         VALUES (?, 'create', 'recurring_rules', ?, ?, ?, ?, ?)`,
    ).bind(user.id, rule.id, rule.horseId, jsonChanges(input), getIp(c), timestamp),
  ]);
  return ok(c, rule, '定期予定を登録し、12か月分を生成しました。', 201);
});

cashflowRoutes.patch('/recurring-rules/:id', async (c) => {
  const { id } = parseValue(c.req.param(), idParamsSchema);
  const input = await parseJson(c, recurringRuleUpdateSchema);
  const current = await findRule(c, id);
  if (input.categoryId) await assertCategory(c, input.categoryId);
  if (input.horseId) await assertHorse(c, input.horseId);
  if (input.clubId) await assertClub(c, input.clubId);
  const user = c.get('user');
  const db = createDatabase(c.env.DB);
  const timestamp = nowIso();
  const [updated] = await db.batch([
    db
      .update(recurringRules)
      .set({ ...input, generatedThroughMonth: null, updatedAt: timestamp })
      .where(and(eq(recurringRules.id, id), eq(recurringRules.userId, user.id)))
      .returning(),
    db
      .update(scheduledCashflows)
      .set({
        title: input.title ?? current.title,
        amountYen: input.amountYen ?? current.amountYen,
        categoryId: input.categoryId ?? current.categoryId,
        direction: input.direction ?? current.direction,
        horseId: input.horseId === undefined ? current.horseId : input.horseId,
        clubId: input.clubId === undefined ? current.clubId : input.clubId,
        note: input.note === undefined ? current.note : input.note,
        updatedAt: timestamp,
      })
      .where(
        and(
          eq(scheduledCashflows.userId, user.id),
          eq(scheduledCashflows.recurringRuleId, id),
          eq(scheduledCashflows.status, 'planned'),
          gte(scheduledCashflows.dueOn, todayInJapan()),
        ),
      ),
    db.insert(auditLogs).values({
      userId: user.id,
      action: 'update',
      entityType: 'recurring_rules',
      entityId: id,
      subjectHorseId: input.horseId === undefined ? current.horseId : input.horseId,
      changesJson: jsonChanges(input),
      ipAddress: getIp(c),
      createdAt: timestamp,
    }),
  ]);
  const rule = updated[0];
  if (rule)
    await generateSchedulesForRule(c.env.DB, rule, scheduleHorizon(todayInJapan().slice(0, 7)));
  return ok(c, rule, '定期予定を更新しました。');
});

cashflowRoutes.delete('/recurring-rules/:id', async (c) => {
  const { id } = parseValue(c.req.param(), idParamsSchema);
  const current = await findRule(c, id);
  const user = c.get('user');
  const db = createDatabase(c.env.DB);
  const timestamp = nowIso();
  const [updated] = await db.batch([
    db
      .update(recurringRules)
      .set({ status: 'ended', updatedAt: timestamp })
      .where(and(eq(recurringRules.id, id), eq(recurringRules.userId, user.id)))
      .returning(),
    db
      .update(scheduledCashflows)
      .set({ status: 'cancelled', updatedAt: timestamp })
      .where(
        and(
          eq(scheduledCashflows.userId, user.id),
          eq(scheduledCashflows.recurringRuleId, id),
          eq(scheduledCashflows.status, 'planned'),
          gte(scheduledCashflows.dueOn, todayInJapan()),
        ),
      ),
    db.insert(auditLogs).values({
      userId: user.id,
      action: 'archive',
      entityType: 'recurring_rules',
      entityId: id,
      subjectHorseId: current.horseId,
      changesJson: null,
      ipAddress: getIp(c),
      createdAt: timestamp,
    }),
  ]);
  return ok(c, updated[0], '定期予定を終了しました。');
});

cashflowRoutes.post('/recurring-rules/generate', async (c) => {
  const { targetMonth } = parseValue(
    { targetMonth: c.req.query('targetMonth') ?? scheduleHorizon(todayInJapan().slice(0, 7)) },
    dashboardQuerySchema,
  );
  const userId = c.get('user').id;
  const db = createDatabase(c.env.DB);
  const rules = await db
    .select()
    .from(recurringRules)
    .where(and(eq(recurringRules.userId, userId), eq(recurringRules.status, 'active')))
    .limit(200);
  let generated = 0;
  for (const rule of rules)
    generated += await generateSchedulesForRule(c.env.DB, rule, targetMonth);
  return ok(c, { generated }, '予定を生成しました。');
});

cashflowRoutes.get('/scheduled-cashflows', async (c) => {
  const query = parseValue(c.req.query(), scheduledListQuerySchema);
  const userId = c.get('user').id;
  const db = createDatabase(c.env.DB);
  const conditions: SQL[] = [eq(scheduledCashflows.userId, userId)];
  if (query.targetMonth) conditions.push(eq(scheduledCashflows.targetMonth, query.targetMonth));
  if (query.from) conditions.push(gte(scheduledCashflows.dueOn, query.from));
  if (query.to) conditions.push(lte(scheduledCashflows.dueOn, query.to));
  if (query.status) conditions.push(eq(scheduledCashflows.status, query.status));
  const where = and(...conditions);
  const [rows, totals] = await Promise.all([
    db
      .select()
      .from(scheduledCashflows)
      .where(where)
      .orderBy(asc(scheduledCashflows.dueOn))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize),
    db.select({ value: count() }).from(scheduledCashflows).where(where),
  ]);
  return paginated(c, rows, {
    page: query.page,
    pageSize: query.pageSize,
    total: totals[0]?.value ?? 0,
  });
});

cashflowRoutes.post('/scheduled-cashflows', async (c) => {
  const input = await parseJson(c, scheduledCashflowCreateSchema);
  const category = await assertCategory(c, input.categoryId);
  if (category?.categoryType !== input.direction)
    throw new ApiError(409, 'CATEGORY_DIRECTION_MISMATCH', 'カテゴリーの種別が一致しません。');
  if (input.horseId) await assertHorse(c, input.horseId);
  if (input.clubId) await assertClub(c, input.clubId);
  const user = c.get('user');
  const db = createDatabase(c.env.DB);
  const timestamp = nowIso();
  const [created] = await db.batch([
    db
      .insert(scheduledCashflows)
      .values({
        userId: user.id,
        ...input,
        recurringRuleId: null,
        status: 'planned',
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .returning(),
    db.insert(auditLogs).values({
      userId: user.id,
      action: 'create',
      entityType: 'scheduled_cashflows',
      entityId: null,
      subjectHorseId: input.horseId ?? null,
      changesJson: jsonChanges(input),
      ipAddress: getIp(c),
      createdAt: timestamp,
    }),
  ]);
  return ok(c, created[0], '予定を登録しました。', 201);
});

cashflowRoutes.patch('/scheduled-cashflows/:id', async (c) => {
  const { id } = parseValue(c.req.param(), idParamsSchema);
  const input = await parseJson(c, scheduledCashflowUpdateSchema);
  const current = await findScheduled(c, id);
  const user = c.get('user');
  const db = createDatabase(c.env.DB);
  const timestamp = nowIso();
  const [updated] = await db.batch([
    db
      .update(scheduledCashflows)
      .set({ ...input, updatedAt: timestamp })
      .where(and(eq(scheduledCashflows.id, id), eq(scheduledCashflows.userId, user.id)))
      .returning(),
    db.insert(auditLogs).values({
      userId: user.id,
      action: 'update',
      entityType: 'scheduled_cashflows',
      entityId: id,
      subjectHorseId: input.horseId === undefined ? current.horseId : input.horseId,
      changesJson: jsonChanges(input),
      ipAddress: getIp(c),
      createdAt: timestamp,
    }),
  ]);
  return ok(c, updated[0], '予定を更新しました。');
});

cashflowRoutes.get('/reconciliations', async (c) => {
  const { page, pageSize } = parseValue(c.req.query(), paginationQuerySchema);
  const userId = c.get('user').id;
  const db = createDatabase(c.env.DB);
  const where = eq(cashflowReconciliations.userId, userId);
  const [rows, totals] = await Promise.all([
    db
      .select({
        id: cashflowReconciliations.id,
        scheduledCashflowId: cashflowReconciliations.scheduledCashflowId,
        cashflowId: cashflowReconciliations.cashflowId,
        matchType: cashflowReconciliations.matchType,
        differenceYen: cashflowReconciliations.differenceYen,
        reason: cashflowReconciliations.reason,
        status: cashflowReconciliations.status,
        matchedAt: cashflowReconciliations.matchedAt,
        createdAt: cashflowReconciliations.createdAt,
        scheduledTitle: scheduledCashflows.title,
        scheduledAmountYen: scheduledCashflows.amountYen,
        scheduledDueOn: scheduledCashflows.dueOn,
        actualTitle: cashflows.title,
        actualAmountYen: cashflows.amountYen,
        actualOccurredOn: cashflows.occurredOn,
      })
      .from(cashflowReconciliations)
      .leftJoin(
        scheduledCashflows,
        and(
          eq(scheduledCashflows.id, cashflowReconciliations.scheduledCashflowId),
          eq(scheduledCashflows.userId, userId),
        ),
      )
      .leftJoin(
        cashflows,
        and(eq(cashflows.id, cashflowReconciliations.cashflowId), eq(cashflows.userId, userId)),
      )
      .where(where)
      .orderBy(desc(cashflowReconciliations.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ value: count() }).from(cashflowReconciliations).where(where),
  ]);
  return paginated(c, rows, { page, pageSize, total: totals[0]?.value ?? 0 });
});

cashflowRoutes.post('/reconciliations', async (c) => {
  const input = await parseJson(c, reconciliationCreateSchema);
  const created = await createReconciliation(
    c,
    input.scheduledCashflowId ?? null,
    input.cashflowId ?? null,
    input.reason ?? null,
  );
  return ok(c, created, '予定と実績を照合しました。', 201);
});

cashflowRoutes.patch('/reconciliations/:id', async (c) => {
  const { id } = parseValue(c.req.param(), idParamsSchema);
  const input = await parseJson(c, reconciliationUpdateSchema);
  const user = c.get('user');
  const db = createDatabase(c.env.DB);
  const current = await db
    .select()
    .from(cashflowReconciliations)
    .where(and(eq(cashflowReconciliations.id, id), eq(cashflowReconciliations.userId, user.id)))
    .limit(1);
  if (!current[0])
    throw new ApiError(404, 'RECONCILIATION_NOT_FOUND', '照合情報が見つかりません。');
  const scheduled = current[0].scheduledCashflowId
    ? await findScheduled(c, current[0].scheduledCashflowId)
    : null;
  const actual = current[0].cashflowId ? await findCashflow(c, current[0].cashflowId) : null;
  const timestamp = nowIso();
  const [updated] = await db.batch([
    db
      .update(cashflowReconciliations)
      .set({ ...input, updatedAt: timestamp })
      .where(eq(cashflowReconciliations.id, id))
      .returning(),
    db.insert(auditLogs).values({
      userId: user.id,
      action: 'update',
      entityType: 'cashflow_reconciliations',
      entityId: id,
      subjectHorseId: scheduled?.horseId ?? actual?.horseId ?? null,
      changesJson: jsonChanges(input),
      ipAddress: getIp(c),
      createdAt: timestamp,
    }),
  ]);
  return ok(c, updated[0], '照合情報を更新しました。');
});

cashflowRoutes.delete('/reconciliations/:id', async (c) => {
  const { id } = parseValue(c.req.param(), idParamsSchema);
  const user = c.get('user');
  const db = createDatabase(c.env.DB);
  const rows = await db
    .select()
    .from(cashflowReconciliations)
    .where(and(eq(cashflowReconciliations.id, id), eq(cashflowReconciliations.userId, user.id)))
    .limit(1);
  const reconciliation = rows[0];
  if (!reconciliation)
    throw new ApiError(404, 'RECONCILIATION_NOT_FOUND', '照合情報が見つかりません。');

  const scheduled = reconciliation.scheduledCashflowId
    ? await findScheduled(c, reconciliation.scheduledCashflowId)
    : null;
  const actual = reconciliation.cashflowId
    ? await findCashflow(c, reconciliation.cashflowId)
    : null;
  const restoredStatus = scheduled
    ? scheduled.dueOn < todayInJapan()
      ? ('overdue' as const)
      : ('planned' as const)
    : null;
  const timestamp = nowIso();
  const deleteReconciliation = db
    .delete(cashflowReconciliations)
    .where(and(eq(cashflowReconciliations.id, id), eq(cashflowReconciliations.userId, user.id)));
  const audit = db.insert(auditLogs).values({
    userId: user.id,
    action: 'delete',
    entityType: 'cashflow_reconciliations',
    entityId: id,
    subjectHorseId: scheduled?.horseId ?? actual?.horseId ?? null,
    changesJson: jsonChanges({
      reason: 'reconciliation_unlinked',
      restoredScheduledStatus: restoredStatus,
    }),
    ipAddress: getIp(c),
    createdAt: timestamp,
  });
  if (scheduled && restoredStatus) {
    await db.batch([
      db
        .update(scheduledCashflows)
        .set({ status: restoredStatus, updatedAt: timestamp })
        .where(
          and(eq(scheduledCashflows.id, scheduled.id), eq(scheduledCashflows.userId, user.id)),
        ),
      deleteReconciliation,
      audit,
    ]);
  } else {
    await db.batch([deleteReconciliation, audit]);
  }
  return ok(c, { deleted: true, restoredScheduledStatus: restoredStatus }, '照合を解除しました。');
});

cashflowRoutes.post('/reconciliations/auto-match', async (c) => {
  const { targetMonth } = parseValue(c.req.query(), dashboardQuerySchema);
  const userId = c.get('user').id;
  const db = createDatabase(c.env.DB);
  const planned = await db
    .select()
    .from(scheduledCashflows)
    .where(
      and(
        eq(scheduledCashflows.userId, userId),
        eq(scheduledCashflows.targetMonth, targetMonth),
        eq(scheduledCashflows.status, 'planned'),
      ),
    )
    .limit(100);
  const actual = await db
    .select()
    .from(cashflows)
    .where(
      and(
        eq(cashflows.userId, userId),
        eq(cashflows.targetMonth, targetMonth),
        eq(cashflows.status, 'confirmed'),
      ),
    )
    .limit(100);
  let matched = 0;
  for (const scheduled of planned) {
    const candidates = actual.filter(
      (item) =>
        item.direction === scheduled.direction &&
        item.amountYen === scheduled.amountYen &&
        Math.abs(Date.parse(item.occurredOn) - Date.parse(scheduled.dueOn)) <= 7 * 86_400_000,
    );
    if (candidates.length === 1) {
      try {
        await createReconciliation(c, scheduled.id, candidates[0]!.id, null);
        matched += 1;
      } catch (error) {
        if (!(error instanceof ApiError && error.code === 'ALREADY_RECONCILED')) throw error;
      }
    }
  }
  return ok(c, { matched }, '自動照合を実行しました。');
});

async function findCashflow(c: Context<AppBindings>, id: number) {
  const row = await createDatabase(c.env.DB)
    .select()
    .from(cashflows)
    .where(and(eq(cashflows.id, id), eq(cashflows.userId, c.get('user').id)))
    .limit(1);
  if (!row[0]) throw new ApiError(404, 'CASHFLOW_NOT_FOUND', '収支が見つかりません。');
  return row[0];
}

async function findScheduled(c: Context<AppBindings>, id: number) {
  const row = await createDatabase(c.env.DB)
    .select()
    .from(scheduledCashflows)
    .where(and(eq(scheduledCashflows.id, id), eq(scheduledCashflows.userId, c.get('user').id)))
    .limit(1);
  if (!row[0]) throw new ApiError(404, 'SCHEDULED_NOT_FOUND', '予定が見つかりません。');
  return row[0];
}

async function findRule(c: Context<AppBindings>, id: number) {
  const row = await createDatabase(c.env.DB)
    .select()
    .from(recurringRules)
    .where(and(eq(recurringRules.id, id), eq(recurringRules.userId, c.get('user').id)))
    .limit(1);
  if (!row[0]) throw new ApiError(404, 'RULE_NOT_FOUND', '定期予定が見つかりません。');
  return row[0];
}

async function createReconciliation(
  c: Context<AppBindings>,
  scheduledId: number | null,
  cashflowId: number | null,
  reason: string | null,
) {
  const user = c.get('user');
  const db = createDatabase(c.env.DB);
  const scheduled = scheduledId ? await findScheduled(c, scheduledId) : null;
  const actual = cashflowId ? await findCashflow(c, cashflowId) : null;
  if (scheduled && actual && scheduled.direction !== actual.direction)
    throw new ApiError(409, 'DIRECTION_MISMATCH', '予定と実績の種別が一致しません。');
  const duplicateReferences: SQL[] = [];
  if (scheduledId)
    duplicateReferences.push(eq(cashflowReconciliations.scheduledCashflowId, scheduledId));
  if (cashflowId) duplicateReferences.push(eq(cashflowReconciliations.cashflowId, cashflowId));
  const duplicate = await db
    .select()
    .from(cashflowReconciliations)
    .where(
      and(
        eq(cashflowReconciliations.userId, user.id),
        duplicateReferences.length === 1 ? duplicateReferences[0] : or(...duplicateReferences),
      ),
    )
    .limit(1);
  if (duplicate[0]) throw new ApiError(409, 'ALREADY_RECONCILED', 'すでに照合されています。');
  const differenceYen = scheduled && actual ? actual.amountYen - scheduled.amountYen : null;
  const matchType =
    scheduled && actual
      ? differenceYen === 0
        ? 'exact'
        : 'difference'
      : scheduled
        ? 'missing_actual'
        : 'unplanned_actual';
  const timestamp = nowIso();
  const insert = db
    .insert(cashflowReconciliations)
    .values({
      userId: user.id,
      scheduledCashflowId: scheduledId,
      cashflowId,
      matchType,
      differenceYen,
      reason,
      status: differenceYen === 0 ? 'resolved' : 'open',
      matchedAt: actual ? timestamp : null,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .returning();
  const audit = db.insert(auditLogs).values({
    userId: user.id,
    action: 'create',
    entityType: 'cashflow_reconciliations',
    entityId: null,
    subjectHorseId: scheduled?.horseId ?? actual?.horseId ?? null,
    changesJson: jsonChanges({
      scheduledCashflowId: scheduledId,
      cashflowId,
      matchType,
      differenceYen,
    }),
    ipAddress: getIp(c),
    createdAt: timestamp,
  });
  if (scheduledId && actual) {
    try {
      const [created] = await db.batch([
        insert,
        db
          .update(scheduledCashflows)
          .set({ status: 'paid', updatedAt: timestamp })
          .where(
            and(eq(scheduledCashflows.id, scheduledId), eq(scheduledCashflows.userId, user.id)),
          ),
        audit,
      ]);
      return created[0];
    } catch (error) {
      if (isReconciliationUniquenessError(error)) throw alreadyReconciledError();
      throw error;
    }
  }
  try {
    const [created] = await db.batch([insert, audit]);
    return created[0];
  } catch (error) {
    if (isReconciliationUniquenessError(error)) throw alreadyReconciledError();
    throw error;
  }
}

function alreadyReconciledError() {
  return new ApiError(409, 'ALREADY_RECONCILED', 'すでに照合されています。');
}

function isReconciliationUniquenessError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.message.includes('uq_reconciliations_scheduled') ||
      error.message.includes('uq_reconciliations_cashflow') ||
      error.message.includes('cashflow_reconciliations.scheduled_cashflow_id') ||
      error.message.includes('cashflow_reconciliations.cashflow_id'))
  );
}

function randomDatabaseId(): number {
  const values = crypto.getRandomValues(new Uint32Array(2));
  const high = (values[0] ?? 0) & 0x001f_ffff;
  const low = values[1] ?? 0;
  return high * 0x1_0000_0000 + low || 1;
}

async function refreshReconciliationDifference(
  db: ReturnType<typeof createDatabase>,
  userId: number,
  cashflowId: number,
  amountYen: number,
) {
  const rows = await db
    .select()
    .from(cashflowReconciliations)
    .where(
      and(
        eq(cashflowReconciliations.userId, userId),
        eq(cashflowReconciliations.cashflowId, cashflowId),
      ),
    )
    .limit(1);
  const reconciliation = rows[0];
  if (!reconciliation?.scheduledCashflowId) return;
  const scheduled = await db
    .select()
    .from(scheduledCashflows)
    .where(eq(scheduledCashflows.id, reconciliation.scheduledCashflowId))
    .limit(1);
  if (!scheduled[0]) return;
  const differenceYen = amountYen - scheduled[0].amountYen;
  await db
    .update(cashflowReconciliations)
    .set({
      differenceYen,
      matchType: differenceYen === 0 ? 'exact' : 'difference',
      status: differenceYen === 0 ? 'resolved' : 'open',
      updatedAt: nowIso(),
    })
    .where(eq(cashflowReconciliations.id, reconciliation.id));
}
