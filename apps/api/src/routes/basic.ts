import {
  auditLogs,
  budgets,
  cashflows,
  categories,
  clubs,
  createDatabase,
  horseNameAliases,
  horses,
  investments,
} from '@horse-asset-manager/database';
import { canTransitionHorseStatus, nowIso } from '@horse-asset-manager/shared';
import {
  budgetCreateSchema,
  budgetUpdateSchema,
  categoryCreateSchema,
  categoryUpdateSchema,
  clubCreateSchema,
  clubUpdateSchema,
  horseCreateSchema,
  horseDeleteSchema,
  idSchema,
  horseOrderUpdateSchema,
  horseListQuerySchema,
  horseUpdateSchema,
  idParamsSchema,
  investmentCreateSchema,
  investmentUpdateSchema,
  paginationQuerySchema,
  yearSchema,
} from '@horse-asset-manager/validation';
import { and, asc, count, desc, eq, inArray, isNull, like, sql, type SQL } from 'drizzle-orm';
import { Hono } from 'hono';

import { requireAuth } from '../lib/auth';
import { ApiError, getIp, jsonChanges, ok, paginated, parseJson, parseValue } from '../lib/http';
import { assertCategory, assertClub, assertHorse } from '../lib/ownership';
import type { AppBindings } from '../types';

export const basicRoutes = new Hono<AppBindings>();
basicRoutes.use('*', requireAuth);

basicRoutes.get('/clubs', async (c) => {
  const { page, pageSize } = parseValue(c.req.query(), paginationQuerySchema);
  const userId = c.get('user').id;
  const db = createDatabase(c.env.DB);
  const where = and(eq(clubs.userId, userId), eq(clubs.status, 'active'));
  const [rows, totalRows] = await Promise.all([
    db
      .select()
      .from(clubs)
      .where(where)
      .orderBy(asc(clubs.name))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ value: count() }).from(clubs).where(where),
  ]);
  return paginated(c, rows, { page, pageSize, total: totalRows[0]?.value ?? 0 });
});

basicRoutes.post('/clubs', async (c) => {
  const input = await parseJson(c, clubCreateSchema);
  const user = c.get('user');
  const db = createDatabase(c.env.DB);
  const timestamp = nowIso();
  const [created] = await db.batch([
    db
      .insert(clubs)
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
      entityType: 'clubs',
      entityId: null,
      changesJson: jsonChanges(input),
      ipAddress: getIp(c),
      createdAt: timestamp,
    }),
  ]);
  return ok(c, created[0], 'クラブを登録しました。', 201);
});

basicRoutes.patch('/clubs/:id', async (c) => {
  const { id } = parseValue(c.req.param(), idParamsSchema);
  const input = await parseJson(c, clubUpdateSchema);
  await assertClub(c, id);
  const user = c.get('user');
  const db = createDatabase(c.env.DB);
  const timestamp = nowIso();
  const [updated] = await db.batch([
    db
      .update(clubs)
      .set({ ...input, updatedAt: timestamp })
      .where(and(eq(clubs.id, id), eq(clubs.userId, user.id)))
      .returning(),
    db.insert(auditLogs).values({
      userId: user.id,
      action: 'update',
      entityType: 'clubs',
      entityId: id,
      changesJson: jsonChanges(input),
      ipAddress: getIp(c),
      createdAt: timestamp,
    }),
  ]);
  return ok(c, updated[0], 'クラブを更新しました。');
});

basicRoutes.delete('/clubs/:id', async (c) => {
  const { id } = parseValue(c.req.param(), idParamsSchema);
  const club = await assertClub(c, id);
  const user = c.get('user');
  const db = createDatabase(c.env.DB);
  const timestamp = nowIso();
  const references = await c.env.DB.prepare(
    `SELECT
        (SELECT COUNT(*) FROM horses WHERE user_id = ? AND club_id = ?) +
        (SELECT COUNT(*) FROM cashflows WHERE user_id = ? AND club_id = ?) +
        (SELECT COUNT(*) FROM recurring_rules WHERE user_id = ? AND club_id = ?) +
        (SELECT COUNT(*) FROM scheduled_cashflows WHERE user_id = ? AND club_id = ?) AS total`,
  )
    .bind(user.id, id, user.id, id, user.id, id, user.id, id)
    .first<{ total: number }>();
  if ((references?.total ?? 0) > 0)
    throw new ApiError(
      409,
      'CLUB_IN_USE',
      'このクラブは馬・収支・支払い予定で使用中のため削除できません。関連データを先に編集または削除してください。',
    );
  await db.batch([
    db.delete(clubs).where(and(eq(clubs.id, id), eq(clubs.userId, user.id))),
    db.insert(auditLogs).values({
      userId: user.id,
      action: 'delete',
      entityType: 'clubs',
      entityId: id,
      changesJson: jsonChanges(club ?? {}),
      ipAddress: getIp(c),
      createdAt: timestamp,
    }),
  ]);
  return ok(c, { deleted: true }, 'クラブを削除しました。');
});

basicRoutes.get('/categories', async (c) => {
  const query = c.req.query();
  const userId = c.get('user').id;
  const db = createDatabase(c.env.DB);
  const conditions: SQL[] = [eq(categories.userId, userId), eq(categories.status, 'active')];
  if (query.categoryType === 'expense' || query.categoryType === 'income')
    conditions.push(eq(categories.categoryType, query.categoryType));
  const rows = await db
    .select()
    .from(categories)
    .where(and(...conditions))
    .orderBy(asc(categories.categoryType), asc(categories.sortOrder), asc(categories.name))
    .limit(100);
  return ok(c, rows);
});

basicRoutes.post('/categories', async (c) => {
  const input = await parseJson(c, categoryCreateSchema);
  if (input.parentId) await assertCategory(c, input.parentId);
  const user = c.get('user');
  const db = createDatabase(c.env.DB);
  const timestamp = nowIso();
  const [created] = await db.batch([
    db
      .insert(categories)
      .values({
        userId: user.id,
        ...input,
        systemCode: null,
        status: 'active',
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .returning(),
    db.insert(auditLogs).values({
      userId: user.id,
      action: 'create',
      entityType: 'categories',
      entityId: null,
      changesJson: jsonChanges(input),
      ipAddress: getIp(c),
      createdAt: timestamp,
    }),
  ]);
  return ok(c, created[0], 'カテゴリーを登録しました。', 201);
});

basicRoutes.patch('/categories/:id', async (c) => {
  const { id } = parseValue(c.req.param(), idParamsSchema);
  const input = await parseJson(c, categoryUpdateSchema);
  const current = await assertCategory(c, id);
  if (input.parentId) await assertCategory(c, input.parentId);
  if (current?.systemCode && input.categoryType && input.categoryType !== current.categoryType) {
    throw new ApiError(
      409,
      'SYSTEM_CATEGORY_TYPE_LOCKED',
      '標準カテゴリーの種別は変更できません。',
    );
  }
  const user = c.get('user');
  const db = createDatabase(c.env.DB);
  const timestamp = nowIso();
  const [updated] = await db.batch([
    db
      .update(categories)
      .set({ ...input, updatedAt: timestamp })
      .where(and(eq(categories.id, id), eq(categories.userId, user.id)))
      .returning(),
    db.insert(auditLogs).values({
      userId: user.id,
      action: 'update',
      entityType: 'categories',
      entityId: id,
      changesJson: jsonChanges(input),
      ipAddress: getIp(c),
      createdAt: timestamp,
    }),
  ]);
  return ok(c, updated[0], 'カテゴリーを更新しました。');
});

basicRoutes.delete('/categories/:id', async (c) => {
  const { id } = parseValue(c.req.param(), idParamsSchema);
  const category = await assertCategory(c, id);
  const user = c.get('user');
  const db = createDatabase(c.env.DB);
  const timestamp = nowIso();
  const references = await c.env.DB.prepare(
    `SELECT
        (SELECT COUNT(*) FROM categories WHERE user_id = ? AND parent_id = ?) +
        (SELECT COUNT(*) FROM cashflows WHERE user_id = ? AND category_id = ?) +
        (SELECT COUNT(*) FROM recurring_rules WHERE user_id = ? AND category_id = ?) +
        (SELECT COUNT(*) FROM scheduled_cashflows WHERE user_id = ? AND category_id = ?) AS total`,
  )
    .bind(user.id, id, user.id, id, user.id, id, user.id, id)
    .first<{ total: number }>();
  if ((references?.total ?? 0) > 0)
    throw new ApiError(
      409,
      'CATEGORY_IN_USE',
      'このカテゴリーは収支・支払い予定で使用中のため削除できません。関連データを先に編集または削除してください。',
    );
  await db.batch([
    db.delete(categories).where(and(eq(categories.id, id), eq(categories.userId, user.id))),
    db.insert(auditLogs).values({
      userId: user.id,
      action: 'delete',
      entityType: 'categories',
      entityId: id,
      changesJson: jsonChanges(category ?? {}),
      ipAddress: getIp(c),
      createdAt: timestamp,
    }),
  ]);
  return ok(c, { deleted: true }, 'カテゴリーを削除しました。');
});

basicRoutes.get('/horses', async (c) => {
  const query = parseValue(c.req.query(), horseListQuerySchema);
  const userId = c.get('user').id;
  const db = createDatabase(c.env.DB);
  const conditions: SQL[] = [eq(horses.userId, userId)];
  if (query.status) conditions.push(eq(horses.status, query.status));
  if (query.clubId) conditions.push(eq(horses.clubId, query.clubId));
  if (query.search) conditions.push(like(horses.name, `%${query.search}%`));
  if (!query.status) conditions.push(sqlNotArchived());
  const where = and(...conditions);
  const [joinedRows, totals] = await Promise.all([
    db
      .select({ horse: horses, investment: investments })
      .from(horses)
      .leftJoin(
        investments,
        and(
          eq(investments.horseId, horses.id),
          eq(investments.userId, userId),
          isNull(investments.archivedAt),
        ),
      )
      .where(where)
      .orderBy(asc(horses.sortOrder), desc(horses.updatedAt))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize),
    db.select({ value: count() }).from(horses).where(where),
  ]);
  const horseIds = joinedRows.map(({ horse }) => horse.id);
  const aliasRows = horseIds.length
    ? await db
        .select({ horseId: horseNameAliases.horseId, name: horseNameAliases.name })
        .from(horseNameAliases)
        .where(
          and(eq(horseNameAliases.userId, userId), inArray(horseNameAliases.horseId, horseIds)),
        )
        .orderBy(asc(horseNameAliases.id))
    : [];
  const aliasesByHorse = new Map<number, string[]>();
  for (const alias of aliasRows) {
    const names = aliasesByHorse.get(alias.horseId) ?? [];
    names.push(alias.name);
    aliasesByHorse.set(alias.horseId, names);
  }
  const rows = joinedRows.map(({ horse, investment }) => ({
    ...horse,
    investment,
    aliases: (aliasesByHorse.get(horse.id) ?? []).filter((name) => name !== horse.name),
  }));
  return paginated(c, rows, {
    page: query.page,
    pageSize: query.pageSize,
    total: totals[0]?.value ?? 0,
  });
});

function sqlNotArchived(): SQL {
  return sql`${horses.status} <> 'archived'`;
}

basicRoutes.post('/horses', async (c) => {
  const input = await parseJson(c, horseCreateSchema);
  if (input.clubId) await assertClub(c, input.clubId);
  const user = c.get('user');
  const db = createDatabase(c.env.DB);
  const timestamp = nowIso();
  const [created] = await db.batch([
    db
      .insert(horses)
      .values({ userId: user.id, ...input, createdAt: timestamp, updatedAt: timestamp })
      .returning(),
    db.insert(auditLogs).values({
      userId: user.id,
      action: 'create',
      entityType: 'horses',
      entityId: null,
      subjectHorseId: sql<number>`last_insert_rowid()`,
      changesJson: jsonChanges(input),
      ipAddress: getIp(c),
      createdAt: timestamp,
    }),
  ]);
  return ok(c, created[0], '馬情報を登録しました。', 201);
});

basicRoutes.get('/horses/:id', async (c) => {
  const { id } = parseValue(c.req.param(), idParamsSchema);
  const horse = await assertHorse(c, id);
  if (!horse) throw new ApiError(404, 'HORSE_NOT_FOUND', '馬情報が見つかりません。');
  const db = createDatabase(c.env.DB);
  const [investment, aliasRows] = await Promise.all([
    db
      .select()
      .from(investments)
      .where(
        and(
          eq(investments.userId, c.get('user').id),
          eq(investments.horseId, id),
          isNull(investments.archivedAt),
        ),
      )
      .limit(1),
    db
      .select({ name: horseNameAliases.name })
      .from(horseNameAliases)
      .where(and(eq(horseNameAliases.userId, c.get('user').id), eq(horseNameAliases.horseId, id)))
      .orderBy(asc(horseNameAliases.id)),
  ]);
  return ok(c, {
    ...horse,
    investment: investment[0] ?? null,
    aliases: aliasRows.map((row) => row.name).filter((name) => name !== horse.name),
  });
});

basicRoutes.patch('/horses/:id', async (c) => {
  const { id } = parseValue(c.req.param(), idParamsSchema);
  const input = await parseJson(c, horseUpdateSchema);
  const current = await assertHorse(c, id);
  if (!current) throw new ApiError(404, 'HORSE_NOT_FOUND', '馬情報が見つかりません。');
  if (input.clubId) await assertClub(c, input.clubId);
  if (input.status && !canTransitionHorseStatus(current.status, input.status)) {
    throw new ApiError(409, 'INVALID_STATUS_TRANSITION', 'このステータスには変更できません。');
  }
  const user = c.get('user');
  const db = createDatabase(c.env.DB);
  const timestamp = nowIso();
  const updateQuery = db
    .update(horses)
    .set({ ...input, updatedAt: timestamp })
    .where(and(eq(horses.id, id), eq(horses.userId, user.id)))
    .returning();
  const auditQuery = db.insert(auditLogs).values({
    userId: user.id,
    action: 'update',
    entityType: 'horses',
    entityId: id,
    subjectHorseId: id,
    changesJson: jsonChanges(input),
    ipAddress: getIp(c),
    createdAt: timestamp,
  });
  if (input.name !== undefined && input.name !== current.name) {
    const [, updatedRows] = await db.batch([
      db
        .insert(horseNameAliases)
        .values({ userId: user.id, horseId: id, name: current.name, createdAt: timestamp })
        .onConflictDoNothing(),
      updateQuery,
      auditQuery,
    ]);
    return ok(c, updatedRows[0], '馬情報を更新しました。');
  }
  const [updatedRows] = await db.batch([updateQuery, auditQuery]);
  return ok(c, updatedRows[0], '馬情報を更新しました。');
});

basicRoutes.patch('/horses/order', async (c) => {
  const input = await parseJson(c, horseOrderUpdateSchema);
  const user = c.get('user');
  const db = createDatabase(c.env.DB);
  const owned = await db
    .select({ id: horses.id })
    .from(horses)
    .where(and(eq(horses.userId, user.id), inArray(horses.id, input.orderedIds)));
  if (owned.length !== input.orderedIds.length)
    throw new ApiError(404, 'HORSE_NOT_FOUND', '並べ替え対象の馬が見つかりません。');
  const timestamp = nowIso();
  await c.env.DB.batch([
    ...input.orderedIds.map((id, index) =>
      c.env.DB
        .prepare('UPDATE horses SET sort_order = ?, updated_at = ? WHERE id = ? AND user_id = ?')
        .bind((index + 1) * 100, timestamp, id, user.id),
    ),
    c.env.DB
      .prepare(
        `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, changes_json, ip_address, created_at)
         VALUES (?, 'update', 'horses', NULL, ?, ?, ?)`,
      )
      .bind(user.id, jsonChanges({ orderedIds: input.orderedIds }), getIp(c), timestamp),
  ]);
  return ok(c, { orderedIds: input.orderedIds }, '馬の表示順を更新しました。');
});

basicRoutes.delete('/horses/:id', async (c) => {
  const { id } = parseValue(c.req.param(), idParamsSchema);
  const input = await parseJson(c, horseDeleteSchema);
  const horse = await assertHorse(c, id);
  if (!horse) throw new ApiError(404, 'HORSE_NOT_FOUND', '馬情報が見つかりません。');
  if (input.confirmationName !== horse.name) {
    throw new ApiError(
      409,
      'HORSE_DELETE_CONFIRMATION_MISMATCH',
      '確認用の馬名が登録されている馬名と一致しません。',
    );
  }
  const user = c.get('user');
  const timestamp = nowIso();
  await c.env.DB.batch([
    c.env.DB.prepare(
      `WITH target(user_id, horse_id) AS (VALUES (?, ?))
         INSERT INTO audit_logs
           (user_id, action, entity_type, entity_id, subject_horse_id, changes_json, ip_address, created_at)
         SELECT
           target.user_id,
           'delete',
           'horse_deletions',
           NULL,
           NULL,
           json_object(
             'horses', 1,
             'investments', (SELECT COUNT(*) FROM investments i WHERE i.user_id = target.user_id AND i.horse_id = target.horse_id),
             'cashflows', (SELECT COUNT(*) FROM cashflows cf WHERE cf.user_id = target.user_id AND cf.horse_id = target.horse_id),
             'recurringRules', (SELECT COUNT(*) FROM recurring_rules rr WHERE rr.user_id = target.user_id AND rr.horse_id = target.horse_id),
             'scheduledCashflows', (SELECT COUNT(*) FROM scheduled_cashflows sc WHERE sc.user_id = target.user_id AND (sc.horse_id = target.horse_id OR sc.recurring_rule_id IN (SELECT rr.id FROM recurring_rules rr WHERE rr.user_id = target.user_id AND rr.horse_id = target.horse_id))),
             'reconciliations', (SELECT COUNT(*) FROM cashflow_reconciliations cr WHERE cr.user_id = target.user_id AND (cr.cashflow_id IN (SELECT cf.id FROM cashflows cf WHERE cf.user_id = target.user_id AND cf.horse_id = target.horse_id) OR cr.scheduled_cashflow_id IN (SELECT sc.id FROM scheduled_cashflows sc WHERE sc.user_id = target.user_id AND (sc.horse_id = target.horse_id OR sc.recurring_rule_id IN (SELECT rr.id FROM recurring_rules rr WHERE rr.user_id = target.user_id AND rr.horse_id = target.horse_id))))),
             'settlements', (SELECT COUNT(*) FROM horse_settlements hs WHERE hs.user_id = target.user_id AND hs.horse_id = target.horse_id),
             'simulationItems', (SELECT COUNT(*) FROM simulation_items si WHERE si.user_id = target.user_id AND si.horse_id = target.horse_id),
             'notifications', (
               SELECT COUNT(*) FROM notifications n
               WHERE n.user_id = target.user_id AND (
                 n.dedupe_key LIKE ('deadline:' || target.horse_id || ':%')
                 OR EXISTS (
                   SELECT 1 FROM scheduled_cashflows sc
                   WHERE sc.user_id = target.user_id
                     AND (sc.horse_id = target.horse_id OR sc.recurring_rule_id IN (SELECT rr.id FROM recurring_rules rr WHERE rr.user_id = target.user_id AND rr.horse_id = target.horse_id))
                     AND (n.dedupe_key LIKE ('due:' || sc.id || ':%') OR n.dedupe_key LIKE ('missing:' || sc.id || ':%'))
                 )
               )
             ),
             'auditLogs', (SELECT COUNT(*) FROM audit_logs al WHERE al.user_id = target.user_id AND al.subject_horse_id = target.horse_id),
             'nameAliases', (SELECT COUNT(*) FROM horse_name_aliases hna WHERE hna.user_id = target.user_id AND hna.horse_id = target.horse_id)
           ),
           NULL,
           ?
         FROM target`,
    ).bind(user.id, id, timestamp),
    c.env.DB.prepare(
      `DELETE FROM notifications
         WHERE user_id = ? AND (
           dedupe_key LIKE ('deadline:' || ? || ':%')
           OR EXISTS (
             SELECT 1 FROM scheduled_cashflows sc
             WHERE sc.user_id = ?
               AND (sc.horse_id = ? OR sc.recurring_rule_id IN (SELECT rr.id FROM recurring_rules rr WHERE rr.user_id = ? AND rr.horse_id = ?))
               AND (notifications.dedupe_key LIKE ('due:' || sc.id || ':%') OR notifications.dedupe_key LIKE ('missing:' || sc.id || ':%'))
           )
         )`,
    ).bind(user.id, id, user.id, id, user.id, id),
    c.env.DB.prepare('DELETE FROM audit_logs WHERE user_id = ? AND subject_horse_id = ?').bind(
      user.id,
      id,
    ),
    c.env.DB.prepare(
      `DELETE FROM cashflow_reconciliations
         WHERE user_id = ? AND (
           cashflow_id IN (SELECT id FROM cashflows WHERE user_id = ? AND horse_id = ?)
           OR scheduled_cashflow_id IN (
             SELECT sc.id FROM scheduled_cashflows sc
             WHERE sc.user_id = ? AND (sc.horse_id = ? OR sc.recurring_rule_id IN (SELECT rr.id FROM recurring_rules rr WHERE rr.user_id = ? AND rr.horse_id = ?))
           )
         )`,
    ).bind(user.id, user.id, id, user.id, id, user.id, id),
    c.env.DB.prepare('DELETE FROM horse_settlements WHERE user_id = ? AND horse_id = ?').bind(
      user.id,
      id,
    ),
    c.env.DB.prepare(
      `DELETE FROM scheduled_cashflows
         WHERE user_id = ? AND (horse_id = ? OR recurring_rule_id IN (SELECT id FROM recurring_rules WHERE user_id = ? AND horse_id = ?))`,
    ).bind(user.id, id, user.id, id),
    c.env.DB.prepare('DELETE FROM recurring_rules WHERE user_id = ? AND horse_id = ?').bind(
      user.id,
      id,
    ),
    c.env.DB.prepare('DELETE FROM simulation_items WHERE user_id = ? AND horse_id = ?').bind(
      user.id,
      id,
    ),
    c.env.DB.prepare('DELETE FROM cashflows WHERE user_id = ? AND horse_id = ?').bind(user.id, id),
    c.env.DB.prepare('DELETE FROM investments WHERE user_id = ? AND horse_id = ?').bind(
      user.id,
      id,
    ),
    c.env.DB.prepare('DELETE FROM horse_name_aliases WHERE user_id = ? AND horse_id = ?').bind(
      user.id,
      id,
    ),
    c.env.DB.prepare('DELETE FROM horses WHERE user_id = ? AND id = ?').bind(user.id, id),
  ]);
  return ok(c, { deleted: true }, '馬と関連データを完全削除しました。');
});

basicRoutes.get('/investments', async (c) => {
  const userId = c.get('user').id;
  const horseId = c.req.query('horseId');
  const conditions: SQL[] = [eq(investments.userId, userId), isNull(investments.archivedAt)];
  if (horseId) conditions.push(eq(investments.horseId, parseValue(horseId, idSchema)));
  const rows = await createDatabase(c.env.DB)
    .select()
    .from(investments)
    .where(and(...conditions))
    .orderBy(desc(investments.updatedAt))
    .limit(100);
  return ok(c, rows);
});

basicRoutes.post('/investments', async (c) => {
  const input = await parseJson(c, investmentCreateSchema);
  const horse = await assertHorse(c, input.horseId);
  if (!horse) throw new ApiError(404, 'HORSE_NOT_FOUND', '馬情報が見つかりません。');
  const user = c.get('user');
  const db = createDatabase(c.env.DB);
  const timestamp = nowIso();
  const { initialCashflow, ...investmentInput } = input;
  const queries = [
    db
      .insert(investments)
      .values({ userId: user.id, ...investmentInput, createdAt: timestamp, updatedAt: timestamp })
      .onConflictDoUpdate({
        target: [investments.userId, investments.horseId],
        set: { ...investmentInput, archivedAt: null, updatedAt: timestamp },
      }),
    db
      .update(horses)
      .set({ status: horse.status === 'active' ? 'active' : 'invested', updatedAt: timestamp })
      .where(and(eq(horses.id, input.horseId), eq(horses.userId, user.id))),
    db.insert(auditLogs).values({
      userId: user.id,
      action: 'create',
      entityType: 'investments',
      entityId: null,
      subjectHorseId: input.horseId,
      changesJson: jsonChanges(investmentInput),
      ipAddress: getIp(c),
      createdAt: timestamp,
    }),
  ] as const;
  if (initialCashflow && initialCashflow.amountYen > 0) {
    const category = (
      await db
        .select()
        .from(categories)
        .where(
          and(eq(categories.userId, user.id), eq(categories.systemCode, 'investment_principal')),
        )
        .limit(1)
    )[0];
    if (!category)
      throw new ApiError(422, 'CATEGORY_MISSING', '出資金カテゴリーが見つかりません。');
    await db.batch([
      ...queries,
      db.insert(cashflows).values({
        userId: user.id,
        horseId: input.horseId,
        clubId: horse.clubId,
        categoryId: category.id,
        direction: 'expense',
        title: `${horse.name} 初回出資金`,
        amountYen: initialCashflow.amountYen,
        occurredOn: initialCashflow.occurredOn,
        targetMonth: initialCashflow.targetMonth,
        status: 'confirmed',
        createdAt: timestamp,
        updatedAt: timestamp,
      }),
    ]);
  } else {
    await db.batch(queries);
  }
  const created = await db
    .select()
    .from(investments)
    .where(and(eq(investments.userId, user.id), eq(investments.horseId, input.horseId)))
    .limit(1);
  return ok(c, created[0], '出資情報を保存しました。', 201);
});

basicRoutes.patch('/investments/:id', async (c) => {
  const { id } = parseValue(c.req.param(), idParamsSchema);
  const input = await parseJson(c, investmentUpdateSchema);
  const user = c.get('user');
  const db = createDatabase(c.env.DB);
  const current = await db
    .select()
    .from(investments)
    .where(and(eq(investments.id, id), eq(investments.userId, user.id)))
    .limit(1);
  if (!current[0]) throw new ApiError(404, 'INVESTMENT_NOT_FOUND', '出資情報が見つかりません。');
  const timestamp = nowIso();
  const [updated] = await db.batch([
    db
      .update(investments)
      .set({ ...input, updatedAt: timestamp })
      .where(and(eq(investments.id, id), eq(investments.userId, user.id)))
      .returning(),
    db.insert(auditLogs).values({
      userId: user.id,
      action: 'update',
      entityType: 'investments',
      entityId: id,
      subjectHorseId: current[0].horseId,
      changesJson: jsonChanges(input),
      ipAddress: getIp(c),
      createdAt: timestamp,
    }),
  ]);
  return ok(c, updated[0], '出資情報を更新しました。');
});

basicRoutes.get('/budgets', async (c) => {
  const year = parseValue(c.req.query('year') ?? new Date().getFullYear().toString(), yearSchema);
  const rows = await createDatabase(c.env.DB)
    .select()
    .from(budgets)
    .where(and(eq(budgets.userId, c.get('user').id), like(budgets.periodKey, `${year}%`)))
    .orderBy(asc(budgets.periodKey));
  return ok(c, rows);
});

basicRoutes.post('/budgets', async (c) => {
  const input = await parseJson(c, budgetCreateSchema);
  const user = c.get('user');
  const db = createDatabase(c.env.DB);
  const timestamp = nowIso();
  await db.batch([
    db
      .insert(budgets)
      .values({ userId: user.id, ...input, createdAt: timestamp, updatedAt: timestamp })
      .onConflictDoUpdate({
        target: [budgets.userId, budgets.budgetType, budgets.periodKey],
        set: { amountYen: input.amountYen, note: input.note, updatedAt: timestamp },
      }),
    db.insert(auditLogs).values({
      userId: user.id,
      action: 'update',
      entityType: 'budgets',
      entityId: null,
      changesJson: jsonChanges(input),
      ipAddress: getIp(c),
      createdAt: timestamp,
    }),
  ]);
  const created = await db
    .select()
    .from(budgets)
    .where(
      and(
        eq(budgets.userId, user.id),
        eq(budgets.budgetType, input.budgetType),
        eq(budgets.periodKey, input.periodKey),
      ),
    )
    .limit(1);
  return ok(c, created[0], '予算を保存しました。', 201);
});

basicRoutes.patch('/budgets/:id', async (c) => {
  const { id } = parseValue(c.req.param(), idParamsSchema);
  const input = await parseJson(c, budgetUpdateSchema);
  const user = c.get('user');
  const db = createDatabase(c.env.DB);
  const current = await db
    .select()
    .from(budgets)
    .where(and(eq(budgets.id, id), eq(budgets.userId, user.id)))
    .limit(1);
  if (!current[0]) throw new ApiError(404, 'BUDGET_NOT_FOUND', '予算が見つかりません。');
  const timestamp = nowIso();
  const [updated] = await db.batch([
    db
      .update(budgets)
      .set({ ...input, updatedAt: timestamp })
      .where(and(eq(budgets.id, id), eq(budgets.userId, user.id)))
      .returning(),
    db.insert(auditLogs).values({
      userId: user.id,
      action: 'update',
      entityType: 'budgets',
      entityId: id,
      changesJson: jsonChanges(input),
      ipAddress: getIp(c),
      createdAt: timestamp,
    }),
  ]);
  return ok(c, updated[0], '予算を更新しました。');
});

basicRoutes.delete('/budgets/:id', async (c) => {
  const { id } = parseValue(c.req.param(), idParamsSchema);
  const user = c.get('user');
  const db = createDatabase(c.env.DB);
  const current = await db
    .select()
    .from(budgets)
    .where(and(eq(budgets.id, id), eq(budgets.userId, user.id)))
    .limit(1);
  if (!current[0]) throw new ApiError(404, 'BUDGET_NOT_FOUND', '予算が見つかりません。');
  const timestamp = nowIso();
  await db.batch([
    db.delete(budgets).where(and(eq(budgets.id, id), eq(budgets.userId, user.id))),
    db.insert(auditLogs).values({
      userId: user.id,
      action: 'delete',
      entityType: 'budgets',
      entityId: id,
      changesJson: jsonChanges(current[0]),
      ipAddress: getIp(c),
      createdAt: timestamp,
    }),
  ]);
  return ok(c, { deleted: true }, '予算を削除しました。');
});
