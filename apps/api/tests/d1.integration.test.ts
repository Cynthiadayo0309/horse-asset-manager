import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { app } from '../src/index';
import {
  createD1Harness,
  createTestUser,
  insertAndGetId,
  testTimestamp,
  type D1Harness,
} from './d1-test-utils';

interface ApiBody<T> {
  data: T;
  message: string;
}

describe('D1 integration', () => {
  let harness: D1Harness;

  beforeEach(async () => {
    harness = await createD1Harness();
  });

  afterEach(async () => {
    await harness.miniflare.dispose();
  });

  it('applies every migration and rolls back a failed D1 batch', async () => {
    const tables = await harness.database
      .prepare(
        "SELECT COUNT(*) AS value FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT GLOB '_cf_*' AND name <> 'd1_migrations'",
      )
      .first<{ value: number }>();
    expect(tables?.value).toBe(19);
    await expect(
      harness.database.batch([
        harness.database
          .prepare(
            `INSERT INTO users (email, name, password_hash, role, status, setup_completed, created_at, updated_at)
             VALUES ('rollback@example.test', 'rollback', 'test', 'user', 'active', 1, ?, ?)`,
          )
          .bind(testTimestamp, testTimestamp),
        harness.database
          .prepare(
            `INSERT INTO budgets (user_id, budget_type, period_key, amount_yen, created_at, updated_at)
             VALUES (1, 'yearly', '2026', -1, ?, ?)`,
          )
          .bind(testTimestamp, testTimestamp),
      ]),
    ).rejects.toThrow();
    const users = await harness.database
      .prepare("SELECT COUNT(*) AS value FROM users WHERE email = 'rollback@example.test'")
      .first<{ value: number }>();
    expect(users?.value).toBe(0);
  });

  it('rolls back every multi-table money operation when a later statement fails', async () => {
    const user = await createTestUser(harness.database, 'rollback-routes@example.test');
    const horseId = await insertHorse(harness.database, user.id, 'ロールバック確認馬');
    await harness.database
      .prepare(
        `INSERT INTO categories
         (user_id, name, category_type, system_code, sort_order, status, created_at, updated_at)
         VALUES (?, '出資金', 'expense', 'investment_principal', 2, 'active', ?, ?)`,
      )
      .bind(user.id, testTimestamp, testTimestamp)
      .run();

    await harness.database
      .prepare(
        `CREATE TRIGGER fail_investment_cashflow BEFORE INSERT ON cashflows
       BEGIN SELECT RAISE(ABORT, 'forced investment failure'); END;`,
      )
      .run();
    const investment = await app.request(
      '/api/investments',
      jsonInit(user.cookie, 'POST', {
        horseId,
        shares: 1,
        unitPriceYen: 50_000,
        committedAmountYen: 50_000,
        initialCashflow: {
          amountYen: 50_000,
          occurredOn: '2026-08-01',
          targetMonth: '2026-08',
        },
      }),
      harness.env,
    );
    expect(investment.status).toBe(500);
    expect(await countRows(harness.database, 'investments', 'user_id = ?', user.id)).toBe(0);
    const horseAfterInvestment = await harness.database
      .prepare('SELECT status FROM horses WHERE id = ?')
      .bind(horseId)
      .first<{ status: string }>();
    expect(horseAfterInvestment?.status).toBe('settling');
    expect(
      await countRows(
        harness.database,
        'audit_logs',
        "user_id = ? AND entity_type = 'investments'",
        user.id,
      ),
    ).toBe(0);
    await harness.database.prepare('DROP TRIGGER fail_investment_cashflow;').run();

    const clubId = await insertAndGetId(
      harness.database,
      "INSERT INTO clubs (user_id, name, status, created_at, updated_at) VALUES (?, '失敗テストクラブ', 'active', ?, ?)",
      user.id,
      testTimestamp,
      testTimestamp,
    );
    await harness.database
      .prepare(
        `CREATE TRIGGER fail_import_cashflow BEFORE INSERT ON cashflows
       BEGIN SELECT RAISE(ABORT, 'forced import failure'); END;`,
      )
      .run();
    const imported = await app.request(
      '/api/statement-imports',
      jsonInit(user.cookie, 'POST', {
        sourceType: 'lord',
        destination: 'confirmed',
        documentHash: 'f'.repeat(64),
        targetMonth: '2026-08',
        expectedExpenseYen: 8_000,
        expectedIncomeYen: 0,
        items: [
          {
            sourceLineKey: 'forced-failure-1',
            horseId,
            clubId,
            categoryId: user.expenseCategoryId,
            direction: 'expense',
            title: '失敗させる取込',
            amountYen: 8_000,
            effectiveOn: '2026-08-02',
            targetMonth: '2026-08',
          },
        ],
      }),
      harness.env,
    );
    expect(imported.status).toBe(500);
    expect(await countRows(harness.database, 'statement_imports', 'user_id = ?', user.id)).toBe(0);
    expect(
      await countRows(
        harness.database,
        'audit_logs',
        "user_id = ? AND entity_type = 'statement_imports'",
        user.id,
      ),
    ).toBe(0);
    await harness.database.prepare('DROP TRIGGER fail_import_cashflow;').run();

    await harness.database
      .prepare(
        `CREATE TRIGGER fail_rule_schedule BEFORE INSERT ON scheduled_cashflows
       BEGIN SELECT RAISE(ABORT, 'forced rule schedule failure'); END;`,
      )
      .run();
    const createdRule = await app.request(
      '/api/recurring-rules',
      jsonInit(user.cookie, 'POST', {
        categoryId: user.expenseCategoryId,
        direction: 'expense',
        title: '作成ごと失敗させる定期予定',
        amountYen: 3_000,
        frequency: 'monthly',
        dayOfMonth: 27,
        startMonth: '2026-08',
      }),
      harness.env,
    );
    expect(createdRule.status).toBe(500);
    expect(await countRows(harness.database, 'recurring_rules', 'user_id = ?', user.id)).toBe(0);
    expect(await countRows(harness.database, 'scheduled_cashflows', 'user_id = ?', user.id)).toBe(
      0,
    );
    expect(
      await countRows(
        harness.database,
        'audit_logs',
        "user_id = ? AND entity_type = 'recurring_rules'",
        user.id,
      ),
    ).toBe(0);
    await harness.database.prepare('DROP TRIGGER fail_rule_schedule;').run();

    const ruleId = await insertAndGetId(
      harness.database,
      `INSERT INTO recurring_rules
       (user_id, category_id, direction, title, amount_yen, frequency, day_of_month, start_month, status, created_at, updated_at)
       VALUES (?, ?, 'expense', '失敗させる定期予定', 3000, 'monthly', 27, '2026-08', 'active', ?, ?)`,
      user.id,
      user.expenseCategoryId,
      testTimestamp,
      testTimestamp,
    );
    await harness.database
      .prepare(
        `CREATE TRIGGER fail_recurring_progress BEFORE UPDATE OF generated_through_month ON recurring_rules
       WHEN NEW.id = ${ruleId} AND NEW.generated_through_month IS NOT NULL
       BEGIN SELECT RAISE(ABORT, 'forced recurring failure'); END;`,
      )
      .run();
    const generated = await app.request(
      '/api/recurring-rules/generate?targetMonth=2026-12',
      jsonInit(user.cookie, 'POST', {}),
      harness.env,
    );
    expect(generated.status).toBe(500);
    expect(await countSchedules(harness.database, ruleId)).toBe(0);
    const ruleAfterFailure = await harness.database
      .prepare(
        'SELECT generated_through_month AS generatedThroughMonth FROM recurring_rules WHERE id = ?',
      )
      .bind(ruleId)
      .first<{ generatedThroughMonth: string | null }>();
    expect(ruleAfterFailure?.generatedThroughMonth).toBeNull();
    await harness.database.prepare('DROP TRIGGER fail_recurring_progress;').run();

    const settlementId = await insertSettlement(harness.database, user.id, horseId, 20_000);
    await harness.database
      .prepare(
        `CREATE TRIGGER fail_settlement_audit BEFORE INSERT ON audit_logs
       WHEN NEW.entity_type = 'horse_settlements'
       BEGIN SELECT RAISE(ABORT, 'forced settlement failure'); END;`,
      )
      .run();
    const completed = await app.request(
      `/api/settlements/${settlementId}/complete`,
      jsonInit(user.cookie, 'POST', {
        settledOn: '2026-08-12',
        categoryId: user.incomeCategoryId,
      }),
      harness.env,
    );
    expect(completed.status).toBe(500);
    expect(
      await countRows(
        harness.database,
        'cashflows',
        'user_id = ? AND idempotency_key = ?',
        user.id,
        `settlement:${settlementId}`,
      ),
    ).toBe(0);
    const settlementAfterFailure = await harness.database
      .prepare('SELECT status, cashflow_id AS cashflowId FROM horse_settlements WHERE id = ?')
      .bind(settlementId)
      .first<{ status: string; cashflowId: number | null }>();
    expect(settlementAfterFailure).toEqual({ status: 'planned', cashflowId: null });
  }, 20_000);

  it('completes a settlement once for sequential and concurrent requests', async () => {
    const user = await createTestUser(harness.database, 'settlement@example.test');
    const horseId = await insertHorse(harness.database, user.id, '精算テスト馬');
    const firstSettlementId = await insertSettlement(harness.database, user.id, horseId, 25_000);
    const request = (settlementId: number) =>
      app.request(
        `/api/settlements/${settlementId}/complete`,
        jsonInit(user.cookie, 'POST', {
          settledOn: '2026-08-12',
          categoryId: user.incomeCategoryId,
        }),
        harness.env,
      );

    expect((await request(firstSettlementId)).status).toBe(200);
    const repeated = await request(firstSettlementId);
    expect(repeated.status).toBe(409);
    await expect(repeated.json()).resolves.toMatchObject({
      error: { code: 'SETTLEMENT_ALREADY_COMPLETED' },
    });

    const secondSettlementId = await insertSettlement(harness.database, user.id, horseId, 30_000);
    const concurrent = await Promise.all([
      request(secondSettlementId),
      request(secondSettlementId),
    ]);
    expect(concurrent.map((response) => response.status).sort()).toEqual([200, 409]);

    const counts = await harness.database
      .prepare(
        `SELECT COUNT(*) AS cashflowCount,
          COUNT(DISTINCT idempotency_key) AS keyCount
         FROM cashflows WHERE user_id = ? AND idempotency_key LIKE 'settlement:%'`,
      )
      .bind(user.id)
      .first<{ cashflowCount: number; keyCount: number }>();
    expect(counts).toEqual({ cashflowCount: 2, keyCount: 2 });
    const audits = await harness.database
      .prepare(
        "SELECT COUNT(*) AS value FROM audit_logs WHERE user_id = ? AND entity_type = 'horse_settlements' AND action = 'update'",
      )
      .bind(user.id)
      .first<{ value: number }>();
    expect(audits?.value).toBe(2);
  });

  it('keeps PDF imports and recurring schedule generation idempotent', async () => {
    const user = await createTestUser(harness.database, 'dedupe@example.test');
    const clubId = await insertAndGetId(
      harness.database,
      `INSERT INTO clubs (user_id, name, status, created_at, updated_at)
       VALUES (?, '重複テストクラブ', 'active', ?, ?)`,
      user.id,
      testTimestamp,
      testTimestamp,
    );
    const importBody = {
      sourceType: 'lord',
      destination: 'confirmed',
      documentHash: 'a'.repeat(64),
      targetMonth: '2026-08',
      expectedExpenseYen: 12_000,
      expectedIncomeYen: 0,
      items: [
        {
          sourceLineKey: 'line-1',
          horseId: null,
          clubId,
          categoryId: user.expenseCategoryId,
          direction: 'expense',
          title: '月会費',
          amountYen: 12_000,
          effectiveOn: '2026-08-10',
          targetMonth: '2026-08',
        },
      ],
    };
    const firstImport = await app.request(
      '/api/statement-imports',
      jsonInit(user.cookie, 'POST', importBody),
      harness.env,
    );
    const secondImport = await app.request(
      '/api/statement-imports',
      jsonInit(user.cookie, 'POST', importBody),
      harness.env,
    );
    expect(firstImport.status).toBe(201);
    expect(secondImport.status).toBe(409);

    const ruleId = await insertAndGetId(
      harness.database,
      `INSERT INTO recurring_rules
       (user_id, category_id, direction, title, amount_yen, frequency, day_of_month, start_month, status, created_at, updated_at)
       VALUES (?, ?, 'expense', '定期会費', 3000, 'monthly', 27, '2026-08', 'active', ?, ?)`,
      user.id,
      user.expenseCategoryId,
      testTimestamp,
      testTimestamp,
    );
    const generate = () =>
      app.request(
        '/api/recurring-rules/generate?targetMonth=2026-12',
        jsonInit(user.cookie, 'POST', {}),
        harness.env,
      );
    expect((await generate()).status).toBe(200);
    const before = await countSchedules(harness.database, ruleId);
    expect((await generate()).status).toBe(200);
    expect(await countSchedules(harness.database, ruleId)).toBe(before);
    const imports = await harness.database
      .prepare('SELECT COUNT(*) AS value FROM statement_imports WHERE user_id = ?')
      .bind(user.id)
      .first<{ value: number }>();
    const importedCashflows = await harness.database
      .prepare(
        'SELECT COUNT(*) AS value FROM cashflows WHERE user_id = ? AND statement_import_id IS NOT NULL',
      )
      .bind(user.id)
      .first<{ value: number }>();
    expect(imports?.value).toBe(1);
    expect(importedCashflows?.value).toBe(1);
  });

  it('unlinks a reconciliation atomically and restores an overdue schedule', async () => {
    const user = await createTestUser(harness.database, 'reconciliation@example.test');
    const scheduledId = await insertAndGetId(
      harness.database,
      `INSERT INTO scheduled_cashflows
       (user_id, category_id, direction, title, amount_yen, due_on, target_month, status, created_at, updated_at)
       VALUES (?, ?, 'expense', '過去の予定', 5000, '2020-01-10', '2020-01', 'planned', ?, ?)`,
      user.id,
      user.expenseCategoryId,
      testTimestamp,
      testTimestamp,
    );
    const cashflowId = await insertAndGetId(
      harness.database,
      `INSERT INTO cashflows
       (user_id, category_id, direction, title, amount_yen, occurred_on, target_month, status, created_at, updated_at)
       VALUES (?, ?, 'expense', '過去の実績', 5000, '2020-01-10', '2020-01', 'confirmed', ?, ?)`,
      user.id,
      user.expenseCategoryId,
      testTimestamp,
      testTimestamp,
    );
    const created = await app.request(
      '/api/reconciliations',
      jsonInit(user.cookie, 'POST', {
        scheduledCashflowId: scheduledId,
        cashflowId,
        reason: 'テスト',
      }),
      harness.env,
    );
    const createdBody = (await created.json()) as ApiBody<{ id: number }>;
    expect(created.status).toBe(201);
    const removed = await app.request(
      `/api/reconciliations/${createdBody.data.id}`,
      { method: 'DELETE', headers: { cookie: user.cookie } },
      harness.env,
    );
    expect(removed.status).toBe(200);
    const scheduled = await harness.database
      .prepare('SELECT status FROM scheduled_cashflows WHERE id = ?')
      .bind(scheduledId)
      .first<{ status: string }>();
    const actual = await harness.database
      .prepare('SELECT status FROM cashflows WHERE id = ?')
      .bind(cashflowId)
      .first<{ status: string }>();
    const reconciliation = await harness.database
      .prepare('SELECT COUNT(*) AS value FROM cashflow_reconciliations WHERE id = ?')
      .bind(createdBody.data.id)
      .first<{ value: number }>();
    expect(scheduled?.status).toBe('overdue');
    expect(actual?.status).toBe('confirmed');
    expect(reconciliation?.value).toBe(0);
  });

  it('keeps dashboard, ledger, analytics, and CSV totals consistent and CSV-safe', async () => {
    const user = await createTestUser(harness.database, 'totals@example.test');
    const horseId = await insertHorse(harness.database, user.id, '集計テスト馬');
    await harness.database.batch([
      harness.database
        .prepare(
          `INSERT INTO cashflows
           (user_id, horse_id, category_id, direction, title, amount_yen, occurred_on, target_month, status, created_at, updated_at)
           VALUES (?, ?, ?, 'expense', '=SUM(A1:A2)', 10000, '2026-08-01', '2026-08', 'confirmed', ?, ?)`,
        )
        .bind(user.id, horseId, user.expenseCategoryId, testTimestamp, testTimestamp),
      harness.database
        .prepare(
          `INSERT INTO cashflows
           (user_id, horse_id, category_id, direction, title, amount_yen, occurred_on, target_month, status, created_at, updated_at)
           VALUES (?, ?, ?, 'income', '分配金', 4000, '2026-08-15', '2026-08', 'confirmed', ?, ?)`,
        )
        .bind(user.id, horseId, user.incomeCategoryId, testTimestamp, testTimestamp),
    ]);
    const get = (path: string) =>
      app.request(path, { headers: { cookie: user.cookie } }, harness.env);
    const dashboard = (await (
      await get('/api/dashboard/summary?targetMonth=2026-08')
    ).json()) as ApiBody<{ actualExpenseYen: number; incomeYen: number; netYen: number }>;
    const ledger = (await (
      await get(`/api/horses/${horseId}/ledger?from=2026-08-01&to=2026-08-31`)
    ).json()) as ApiBody<{
      summary: { expenseYen: number; incomeYen: number; profitLossYen: number };
    }>;
    const analytics = (await (
      await get('/api/analytics/monthly?from=2026-08-01&to=2026-08-31')
    ).json()) as ApiBody<Array<{ expenseYen: number; incomeYen: number; profitLossYen: number }>>;
    const csvResponse = await get('/api/export/cashflows.csv?from=2026-08-01&to=2026-08-31');
    const csvBytes = new Uint8Array(await csvResponse.arrayBuffer());
    const csv = new TextDecoder().decode(csvBytes.slice(3));

    expect(dashboard.data).toMatchObject({
      actualExpenseYen: 10_000,
      incomeYen: 4_000,
      netYen: -6_000,
    });
    expect(ledger.data.summary).toMatchObject({
      expenseYen: 10_000,
      incomeYen: 4_000,
      profitLossYen: -6_000,
    });
    expect(analytics.data[0]).toMatchObject({
      expenseYen: 10_000,
      incomeYen: 4_000,
      profitLossYen: -6_000,
    });
    expect([...csvBytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(csv).toContain('"\'=SUM(A1:A2)"');
    expect(csv).toContain('"10000"');
    expect(csv).toContain('"4000"');
  });

  it('returns 404 for another user across the major resource APIs', async () => {
    const owner = await createTestUser(harness.database, 'owner@example.test');
    const outsider = await createTestUser(harness.database, 'outsider@example.test');
    const clubId = await insertAndGetId(
      harness.database,
      "INSERT INTO clubs (user_id, name, status, created_at, updated_at) VALUES (?, '所有クラブ', 'active', ?, ?)",
      owner.id,
      testTimestamp,
      testTimestamp,
    );
    const horseId = await insertHorse(harness.database, owner.id, '所有馬');
    const investmentId = await insertAndGetId(
      harness.database,
      `INSERT INTO investments
       (user_id, horse_id, shares, unit_price_yen, committed_amount_yen, created_at, updated_at)
       VALUES (?, ?, 1, 10000, 10000, ?, ?)`,
      owner.id,
      horseId,
      testTimestamp,
      testTimestamp,
    );
    const cashflowId = await insertAndGetId(
      harness.database,
      `INSERT INTO cashflows
       (user_id, horse_id, club_id, category_id, direction, title, amount_yen, occurred_on, target_month, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'expense', '所有収支', 10000, '2026-08-01', '2026-08', 'confirmed', ?, ?)`,
      owner.id,
      horseId,
      clubId,
      owner.expenseCategoryId,
      testTimestamp,
      testTimestamp,
    );
    const ruleId = await insertAndGetId(
      harness.database,
      `INSERT INTO recurring_rules
       (user_id, horse_id, club_id, category_id, direction, title, amount_yen, frequency, day_of_month, start_month, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'expense', '所有ルール', 3000, 'monthly', 27, '2026-08', 'active', ?, ?)`,
      owner.id,
      horseId,
      clubId,
      owner.expenseCategoryId,
      testTimestamp,
      testTimestamp,
    );
    const scheduledId = await insertAndGetId(
      harness.database,
      `INSERT INTO scheduled_cashflows
       (user_id, recurring_rule_id, horse_id, club_id, category_id, direction, title, amount_yen, due_on, target_month, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'expense', '所有予定', 10000, '2026-08-01', '2026-08', 'paid', ?, ?)`,
      owner.id,
      ruleId,
      horseId,
      clubId,
      owner.expenseCategoryId,
      testTimestamp,
      testTimestamp,
    );
    const reconciliationId = await insertAndGetId(
      harness.database,
      `INSERT INTO cashflow_reconciliations
       (user_id, scheduled_cashflow_id, cashflow_id, match_type, difference_yen, status, matched_at, created_at, updated_at)
       VALUES (?, ?, ?, 'exact', 0, 'resolved', ?, ?, ?)`,
      owner.id,
      scheduledId,
      cashflowId,
      testTimestamp,
      testTimestamp,
      testTimestamp,
    );
    const budgetId = await insertAndGetId(
      harness.database,
      `INSERT INTO budgets (user_id, budget_type, period_key, amount_yen, created_at, updated_at)
       VALUES (?, 'yearly', '2026', 100000, ?, ?)`,
      owner.id,
      testTimestamp,
      testTimestamp,
    );
    const scenarioId = await insertAndGetId(
      harness.database,
      `INSERT INTO simulation_scenarios
       (user_id, name, start_month, assumed_period_months, status, created_at, updated_at)
       VALUES (?, '所有シナリオ', '2026-08', 12, 'active', ?, ?)`,
      owner.id,
      testTimestamp,
      testTimestamp,
    );
    const itemId = await insertAndGetId(
      harness.database,
      `INSERT INTO simulation_items
       (scenario_id, user_id, title, shares, initial_amount_yen, monthly_amount_yen, annual_amount_yen, created_at, updated_at)
       VALUES (?, ?, '所有候補', 1, 0, 0, 0, ?, ?)`,
      scenarioId,
      owner.id,
      testTimestamp,
      testTimestamp,
    );
    const settlementId = await insertSettlement(harness.database, owner.id, horseId, 20_000);
    const alertRuleId = await insertAndGetId(
      harness.database,
      `INSERT INTO alert_rules
       (user_id, rule_type, condition_json, is_enabled, notify_via, created_at, updated_at)
       VALUES (?, 'due_date', '{}', 1, 'in_app', ?, ?)`,
      owner.id,
      testTimestamp,
      testTimestamp,
    );
    const notificationId = await insertAndGetId(
      harness.database,
      `INSERT INTO notifications
       (user_id, alert_rule_id, dedupe_key, title, message, severity, is_read, created_at)
       VALUES (?, ?, 'owner-only', '所有通知', '通知本文', 'info', 0, ?)`,
      owner.id,
      alertRuleId,
      testTimestamp,
    );
    const documentHash = 'b'.repeat(64);
    await harness.database
      .prepare(
        `INSERT INTO statement_imports
         (user_id, source_type, document_hash, target_month, destination, item_count, created_at)
         VALUES (?, 'lord', ?, '2026-08', 'confirmed', 1, ?)`,
      )
      .bind(owner.id, documentHash, testTimestamp)
      .run();

    const crossUserRequest = async (
      path: string,
      method: 'GET' | 'POST' | 'PATCH' | 'DELETE' = 'GET',
      body?: unknown,
    ): Promise<Response> => {
      const init: RequestInit =
        body === undefined
          ? { method, headers: { cookie: outsider.cookie } }
          : {
              method,
              headers: { cookie: outsider.cookie, 'content-type': 'application/json' },
              body: JSON.stringify(body),
            };
      return await app.request(path, init, harness.env);
    };

    const requests: Array<() => Promise<Response>> = [
      () => crossUserRequest(`/api/horses/${horseId}`),
      () => crossUserRequest(`/api/horses/${horseId}/settlements`),
      () => crossUserRequest(`/api/cashflows/${cashflowId}`),
      () => crossUserRequest(`/api/clubs/${clubId}`, 'PATCH', { description: '変更' }),
      () =>
        crossUserRequest(`/api/categories/${owner.expenseCategoryId}`, 'PATCH', {
          name: '変更',
        }),
      () => crossUserRequest(`/api/investments/${investmentId}`, 'PATCH', { note: '変更' }),
      () => crossUserRequest(`/api/budgets/${budgetId}`, 'PATCH', { note: '変更' }),
      () => crossUserRequest(`/api/recurring-rules/${ruleId}`, 'PATCH', { note: '変更' }),
      () =>
        crossUserRequest(`/api/scheduled-cashflows/${scheduledId}`, 'PATCH', {
          note: '変更',
        }),
      () =>
        crossUserRequest(`/api/reconciliations/${reconciliationId}`, 'PATCH', {
          status: 'resolved',
        }),
      () => crossUserRequest(`/api/reconciliations/${reconciliationId}`, 'DELETE'),
      () => crossUserRequest(`/api/simulations/${scenarioId}`),
      () =>
        crossUserRequest(`/api/simulations/${scenarioId}/items/${itemId}`, 'PATCH', {
          note: '変更',
        }),
      () =>
        crossUserRequest(`/api/settlements/${settlementId}/complete`, 'POST', {
          settledOn: '2026-08-12',
          categoryId: outsider.incomeCategoryId,
        }),
      () => crossUserRequest(`/api/notifications/${notificationId}/read`, 'PATCH', {}),
      () =>
        crossUserRequest(`/api/alert-rules/${alertRuleId}`, 'PATCH', {
          condition: {},
          isEnabled: true,
        }),
    ];
    const statuses: number[] = [];
    for (const request of requests) statuses.push((await request()).status);
    expect(statuses).toEqual(Array.from({ length: requests.length }, () => 404));

    const importCheck = await crossUserRequest(
      `/api/statement-imports/check?documentHash=${documentHash}`,
    );
    expect(importCheck.status).toBe(200);
    await expect(importCheck.json()).resolves.toMatchObject({ data: { imported: false } });
  }, 20_000);
});

function jsonInit(cookie: string, method: 'POST' | 'PATCH', body: unknown): RequestInit {
  return {
    method,
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  };
}

async function insertHorse(database: D1Database, userId: number, name: string): Promise<number> {
  return insertAndGetId(
    database,
    `INSERT INTO horses (user_id, name, status, created_at, updated_at)
     VALUES (?, ?, 'settling', ?, ?)`,
    userId,
    name,
    testTimestamp,
    testTimestamp,
  );
}

async function insertSettlement(
  database: D1Database,
  userId: number,
  horseId: number,
  amountYen: number,
): Promise<number> {
  return insertAndGetId(
    database,
    `INSERT INTO horse_settlements
     (user_id, horse_id, settlement_type, direction, amount_yen, planned_on, status, created_at, updated_at)
     VALUES (?, ?, 'sale_proceeds', 'income', ?, '2026-08-12', 'planned', ?, ?)`,
    userId,
    horseId,
    amountYen,
    testTimestamp,
    testTimestamp,
  );
}

async function countSchedules(database: D1Database, ruleId: number): Promise<number> {
  const row = await database
    .prepare('SELECT COUNT(*) AS value FROM scheduled_cashflows WHERE recurring_rule_id = ?')
    .bind(ruleId)
    .first<{ value: number }>();
  return row?.value ?? 0;
}

async function countRows(
  database: D1Database,
  table: string,
  where: string,
  ...bindings: unknown[]
): Promise<number> {
  const row = await database
    .prepare(`SELECT COUNT(*) AS value FROM ${table} WHERE ${where}`)
    .bind(...bindings)
    .first<{ value: number }>();
  return row?.value ?? 0;
}
