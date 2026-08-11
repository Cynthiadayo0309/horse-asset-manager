import { sql } from 'drizzle-orm';
import {
  type AnySQLiteColumn,
  check,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

const timestamps = {
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
};

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  passwordHash: text('password_hash').notNull(),
  role: text('role', { enum: ['user', 'admin'] })
    .notNull()
    .default('user'),
  status: text('status', { enum: ['active', 'disabled'] })
    .notNull()
    .default('active'),
  setupCompleted: integer('setup_completed', { mode: 'boolean' }).notNull().default(false),
  ...timestamps,
});

export const sessions = sqliteTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: text('expires_at').notNull(),
    lastUsedAt: text('last_used_at').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    index('idx_sessions_user_id').on(table.userId),
    index('idx_sessions_expires_at').on(table.expiresAt),
  ],
);

export const clubs = sqliteTable(
  'clubs',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    shortName: text('short_name'),
    description: text('description'),
    status: text('status', { enum: ['active', 'archived'] })
      .notNull()
      .default('active'),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('uq_clubs_user_name').on(table.userId, table.name),
    index('idx_clubs_user_status').on(table.userId, table.status),
  ],
);

export const categories = sqliteTable(
  'categories',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    categoryType: text('category_type', { enum: ['expense', 'income'] }).notNull(),
    systemCode: text('system_code'),
    parentId: integer('parent_id').references((): AnySQLiteColumn => categories.id, {
      onDelete: 'restrict',
    }),
    sortOrder: integer('sort_order').notNull().default(0),
    status: text('status', { enum: ['active', 'archived'] })
      .notNull()
      .default('active'),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('uq_categories_user_type_name').on(table.userId, table.categoryType, table.name),
    uniqueIndex('uq_categories_user_system_code').on(table.userId, table.systemCode),
    index('idx_categories_user_type_status').on(table.userId, table.categoryType, table.status),
  ],
);

export const budgets = sqliteTable(
  'budgets',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    budgetType: text('budget_type', { enum: ['monthly', 'yearly'] }).notNull(),
    periodKey: text('period_key').notNull(),
    amountYen: integer('amount_yen').notNull(),
    note: text('note'),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('uq_budgets_user_type_period').on(table.userId, table.budgetType, table.periodKey),
    index('idx_budgets_user_period').on(table.userId, table.periodKey),
    check('ck_budgets_amount_nonnegative', sql`${table.amountYen} >= 0`),
  ],
);

export const horses = sqliteTable(
  'horses',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    clubId: integer('club_id').references(() => clubs.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    nameKana: text('name_kana'),
    gender: text('gender', { enum: ['male', 'female', 'gelding', 'unknown'] }),
    birthDate: text('birth_date'),
    sire: text('sire'),
    dam: text('dam'),
    damsire: text('damsire'),
    trainer: text('trainer'),
    recruitmentYear: integer('recruitment_year'),
    totalPriceYen: integer('total_price_yen'),
    totalShares: integer('total_shares'),
    unitPriceYen: integer('unit_price_yen'),
    plannedShares: integer('planned_shares'),
    initialPaymentYen: integer('initial_payment_yen'),
    expectedMonthlyCostYen: integer('expected_monthly_cost_yen'),
    expectedInsuranceYen: integer('expected_insurance_yen'),
    applicationDeadline: text('application_deadline'),
    status: text('status', {
      enum: [
        'considering',
        'applied',
        'invested',
        'active',
        'retired',
        'settling',
        'settled',
        'rejected',
        'skipped',
      ],
    })
      .notNull()
      .default('considering'),
    retiredOn: text('retired_on'),
    settledOn: text('settled_on'),
    note: text('note'),
    ...timestamps,
  },
  (table) => [
    index('idx_horses_user_status').on(table.userId, table.status),
    index('idx_horses_user_club').on(table.userId, table.clubId),
    index('idx_horses_user_deadline').on(table.userId, table.applicationDeadline),
    check(
      'ck_horses_total_price_nonnegative',
      sql`${table.totalPriceYen} IS NULL OR ${table.totalPriceYen} >= 0`,
    ),
    check(
      'ck_horses_unit_price_nonnegative',
      sql`${table.unitPriceYen} IS NULL OR ${table.unitPriceYen} >= 0`,
    ),
  ],
);

export const horseNameAliases = sqliteTable(
  'horse_name_aliases',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    horseId: integer('horse_id')
      .notNull()
      .references(() => horses.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('uq_horse_name_aliases_user_horse_name').on(
      table.userId,
      table.horseId,
      table.name,
    ),
    index('idx_horse_name_aliases_user_horse').on(table.userId, table.horseId),
  ],
);

export const investments = sqliteTable(
  'investments',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    horseId: integer('horse_id')
      .notNull()
      .references(() => horses.id, { onDelete: 'restrict' }),
    shares: integer('shares').notNull(),
    unitPriceYen: integer('unit_price_yen').notNull(),
    committedAmountYen: integer('committed_amount_yen').notNull(),
    joinedOn: text('joined_on'),
    note: text('note'),
    archivedAt: text('archived_at'),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('uq_investments_user_horse').on(table.userId, table.horseId),
    index('idx_investments_user').on(table.userId),
    check('ck_investments_shares_positive', sql`${table.shares} > 0`),
    check('ck_investments_unit_price_nonnegative', sql`${table.unitPriceYen} >= 0`),
    check('ck_investments_amount_nonnegative', sql`${table.committedAmountYen} >= 0`),
  ],
);

export const statementImports = sqliteTable(
  'statement_imports',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    sourceType: text('source_type', { enum: ['lord', 'silk'] }).notNull(),
    documentHash: text('document_hash').notNull(),
    targetMonth: text('target_month').notNull(),
    destination: text('destination', { enum: ['scheduled', 'confirmed'] }).notNull(),
    itemCount: integer('item_count').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('uq_statement_imports_user_hash').on(table.userId, table.documentHash),
    index('idx_statement_imports_user_created').on(table.userId, table.createdAt),
    check('ck_statement_imports_item_count_positive', sql`${table.itemCount} > 0`),
  ],
);

export const cashflows = sqliteTable(
  'cashflows',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    horseId: integer('horse_id').references(() => horses.id, { onDelete: 'restrict' }),
    clubId: integer('club_id').references(() => clubs.id, { onDelete: 'restrict' }),
    categoryId: integer('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'restrict' }),
    statementImportId: integer('statement_import_id').references(() => statementImports.id, {
      onDelete: 'restrict',
    }),
    sourceLineKey: text('source_line_key'),
    direction: text('direction', { enum: ['expense', 'income'] }).notNull(),
    title: text('title').notNull(),
    amountYen: integer('amount_yen').notNull(),
    occurredOn: text('occurred_on').notNull(),
    targetMonth: text('target_month').notNull(),
    paymentMethod: text('payment_method'),
    status: text('status', { enum: ['confirmed', 'cancelled', 'archived'] })
      .notNull()
      .default('confirmed'),
    note: text('note'),
    ...timestamps,
  },
  (table) => [
    index('idx_cashflows_user_target_status').on(table.userId, table.targetMonth, table.status),
    index('idx_cashflows_user_occurred').on(table.userId, table.occurredOn),
    index('idx_cashflows_user_horse').on(table.userId, table.horseId),
    index('idx_cashflows_user_club').on(table.userId, table.clubId),
    index('idx_cashflows_user_category').on(table.userId, table.categoryId),
    uniqueIndex('uq_cashflows_user_import_line').on(
      table.userId,
      table.statementImportId,
      table.sourceLineKey,
    ),
    check('ck_cashflows_amount_nonnegative', sql`${table.amountYen} >= 0`),
  ],
);

export const recurringRules = sqliteTable(
  'recurring_rules',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    horseId: integer('horse_id').references(() => horses.id, { onDelete: 'restrict' }),
    clubId: integer('club_id').references(() => clubs.id, { onDelete: 'restrict' }),
    categoryId: integer('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'restrict' }),
    direction: text('direction', { enum: ['expense', 'income'] })
      .notNull()
      .default('expense'),
    title: text('title').notNull(),
    amountYen: integer('amount_yen').notNull(),
    frequency: text('frequency', { enum: ['monthly', 'yearly', 'once'] }).notNull(),
    dayOfMonth: integer('day_of_month').notNull(),
    startMonth: text('start_month').notNull(),
    endMonth: text('end_month'),
    generatedThroughMonth: text('generated_through_month'),
    status: text('status', { enum: ['active', 'inactive', 'ended'] })
      .notNull()
      .default('active'),
    note: text('note'),
    ...timestamps,
  },
  (table) => [
    index('idx_recurring_rules_user_status').on(table.userId, table.status),
    index('idx_recurring_rules_generation').on(table.status, table.generatedThroughMonth),
    check('ck_recurring_rules_amount_nonnegative', sql`${table.amountYen} >= 0`),
    check('ck_recurring_rules_day', sql`${table.dayOfMonth} BETWEEN 1 AND 31`),
  ],
);

export const scheduledCashflows = sqliteTable(
  'scheduled_cashflows',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    recurringRuleId: integer('recurring_rule_id').references(() => recurringRules.id, {
      onDelete: 'restrict',
    }),
    horseId: integer('horse_id').references(() => horses.id, { onDelete: 'restrict' }),
    clubId: integer('club_id').references(() => clubs.id, { onDelete: 'restrict' }),
    categoryId: integer('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'restrict' }),
    statementImportId: integer('statement_import_id').references(() => statementImports.id, {
      onDelete: 'restrict',
    }),
    sourceLineKey: text('source_line_key'),
    direction: text('direction', { enum: ['expense', 'income'] }).notNull(),
    title: text('title').notNull(),
    amountYen: integer('amount_yen').notNull(),
    dueOn: text('due_on').notNull(),
    targetMonth: text('target_month').notNull(),
    status: text('status', { enum: ['planned', 'paid', 'cancelled', 'overdue'] })
      .notNull()
      .default('planned'),
    note: text('note'),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('uq_scheduled_rule_due').on(table.userId, table.recurringRuleId, table.dueOn),
    index('idx_scheduled_user_target_status').on(table.userId, table.targetMonth, table.status),
    index('idx_scheduled_user_due_status').on(table.userId, table.dueOn, table.status),
    index('idx_scheduled_user_horse').on(table.userId, table.horseId),
    uniqueIndex('uq_scheduled_user_import_line').on(
      table.userId,
      table.statementImportId,
      table.sourceLineKey,
    ),
    check('ck_scheduled_amount_nonnegative', sql`${table.amountYen} >= 0`),
  ],
);

export const cashflowReconciliations = sqliteTable(
  'cashflow_reconciliations',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    scheduledCashflowId: integer('scheduled_cashflow_id').references(() => scheduledCashflows.id, {
      onDelete: 'restrict',
    }),
    cashflowId: integer('cashflow_id').references(() => cashflows.id, { onDelete: 'restrict' }),
    matchType: text('match_type', {
      enum: ['exact', 'difference', 'missing_actual', 'unplanned_actual'],
    }).notNull(),
    differenceYen: integer('difference_yen'),
    reason: text('reason'),
    status: text('status', { enum: ['open', 'resolved'] })
      .notNull()
      .default('open'),
    matchedAt: text('matched_at'),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('uq_reconciliations_scheduled').on(table.scheduledCashflowId),
    uniqueIndex('uq_reconciliations_cashflow').on(table.cashflowId),
    index('idx_reconciliations_user_status').on(table.userId, table.status),
    check(
      'ck_reconciliations_has_side',
      sql`${table.scheduledCashflowId} IS NOT NULL OR ${table.cashflowId} IS NOT NULL`,
    ),
  ],
);

export const simulationScenarios = sqliteTable(
  'simulation_scenarios',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    description: text('description'),
    startMonth: text('start_month').notNull(),
    assumedPeriodMonths: integer('assumed_period_months').notNull().default(12),
    status: text('status', { enum: ['active', 'archived'] })
      .notNull()
      .default('active'),
    ...timestamps,
  },
  (table) => [index('idx_simulation_scenarios_user_status').on(table.userId, table.status)],
);

export const simulationItems = sqliteTable(
  'simulation_items',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    scenarioId: integer('scenario_id')
      .notNull()
      .references(() => simulationScenarios.id, { onDelete: 'cascade' }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    horseId: integer('horse_id').references(() => horses.id, { onDelete: 'restrict' }),
    title: text('title').notNull(),
    shares: integer('shares').notNull().default(1),
    initialAmountYen: integer('initial_amount_yen').notNull().default(0),
    monthlyAmountYen: integer('monthly_amount_yen').notNull().default(0),
    annualAmountYen: integer('annual_amount_yen').notNull().default(0),
    note: text('note'),
    ...timestamps,
  },
  (table) => [
    index('idx_simulation_items_user_scenario').on(table.userId, table.scenarioId),
    check('ck_simulation_items_shares_positive', sql`${table.shares} > 0`),
    check('ck_simulation_items_initial_nonnegative', sql`${table.initialAmountYen} >= 0`),
    check('ck_simulation_items_monthly_nonnegative', sql`${table.monthlyAmountYen} >= 0`),
    check('ck_simulation_items_annual_nonnegative', sql`${table.annualAmountYen} >= 0`),
  ],
);

export const horseSettlements = sqliteTable(
  'horse_settlements',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    horseId: integer('horse_id')
      .notNull()
      .references(() => horses.id, { onDelete: 'restrict' }),
    cashflowId: integer('cashflow_id').references(() => cashflows.id, { onDelete: 'restrict' }),
    settlementType: text('settlement_type', {
      enum: [
        'final_cost',
        'sale_proceeds',
        'insurance',
        'refund',
        'retirement_settlement',
        'other',
      ],
    }).notNull(),
    direction: text('direction', { enum: ['expense', 'income'] }).notNull(),
    amountYen: integer('amount_yen').notNull(),
    plannedOn: text('planned_on'),
    settledOn: text('settled_on'),
    status: text('status', { enum: ['planned', 'received', 'paid', 'cancelled'] })
      .notNull()
      .default('planned'),
    note: text('note'),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('uq_horse_settlements_cashflow').on(table.cashflowId),
    index('idx_horse_settlements_user_horse').on(table.userId, table.horseId),
    check('ck_horse_settlements_amount_nonnegative', sql`${table.amountYen} >= 0`),
  ],
);

export const alertRules = sqliteTable(
  'alert_rules',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    ruleType: text('rule_type', {
      enum: ['due_date', 'deadline', 'budget', 'input_missing', 'concentration'],
    }).notNull(),
    conditionJson: text('condition_json').notNull(),
    isEnabled: integer('is_enabled', { mode: 'boolean' }).notNull().default(true),
    notifyVia: text('notify_via', { enum: ['in_app'] })
      .notNull()
      .default('in_app'),
    ...timestamps,
  },
  (table) => [uniqueIndex('uq_alert_rules_user_type').on(table.userId, table.ruleType)],
);

export const notifications = sqliteTable(
  'notifications',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    alertRuleId: integer('alert_rule_id').references(() => alertRules.id, { onDelete: 'set null' }),
    dedupeKey: text('dedupe_key').notNull(),
    title: text('title').notNull(),
    message: text('message').notNull(),
    severity: text('severity', { enum: ['info', 'warning', 'error'] }).notNull(),
    isRead: integer('is_read', { mode: 'boolean' }).notNull().default(false),
    readAt: text('read_at'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('uq_notifications_user_dedupe').on(table.userId, table.dedupeKey),
    index('idx_notifications_user_read_created').on(table.userId, table.isRead, table.createdAt),
  ],
);

export const auditLogs = sqliteTable(
  'audit_logs',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    action: text('action', {
      enum: ['create', 'update', 'archive', 'delete', 'login', 'logout'],
    }).notNull(),
    entityType: text('entity_type').notNull(),
    entityId: integer('entity_id'),
    subjectHorseId: integer('subject_horse_id'),
    changesJson: text('changes_json'),
    ipAddress: text('ip_address'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    index('idx_audit_logs_user_entity').on(table.userId, table.entityType, table.entityId),
    index('idx_audit_logs_user_horse').on(table.userId, table.subjectHorseId),
  ],
);

export const schema = {
  users,
  sessions,
  clubs,
  categories,
  budgets,
  horses,
  horseNameAliases,
  investments,
  statementImports,
  cashflows,
  recurringRules,
  scheduledCashflows,
  cashflowReconciliations,
  simulationScenarios,
  simulationItems,
  horseSettlements,
  alertRules,
  notifications,
  auditLogs,
};
