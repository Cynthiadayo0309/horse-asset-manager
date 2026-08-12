import type { Database } from '@horse-asset-manager/database';
import { recurringRules, scheduledCashflows } from '@horse-asset-manager/database';
import {
  addMonths,
  generateOccurrenceDates,
  getYearMonth,
  nowIso,
} from '@horse-asset-manager/shared';
import { and, eq, isNull, lt, or } from 'drizzle-orm';

export type RecurringRule = typeof recurringRules.$inferSelect;

export function scheduleHorizon(currentMonth: string): string {
  return addMonths(currentMonth, 11);
}

export function prepareScheduleStatements(
  binding: D1Database,
  rule: RecurringRule,
  throughMonth: string,
  timestamp = nowIso(),
): { count: number; statements: D1PreparedStatement[] } {
  const dates = generateOccurrenceDates(
    {
      frequency: rule.frequency,
      startMonth: rule.startMonth,
      endMonth: rule.endMonth,
      dayOfMonth: rule.dayOfMonth,
    },
    throughMonth,
  );
  return {
    count: dates.length,
    statements: dates.map((dueOn) =>
      binding
        .prepare(
          `INSERT INTO scheduled_cashflows
            (user_id, recurring_rule_id, horse_id, club_id, category_id, direction, title, amount_yen, due_on, target_month, status, note, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'planned', ?, ?, ?)
           ON CONFLICT(user_id, recurring_rule_id, due_on) DO NOTHING`,
        )
        .bind(
          rule.userId,
          rule.id,
          rule.horseId,
          rule.clubId,
          rule.categoryId,
          rule.direction,
          rule.title,
          rule.amountYen,
          dueOn,
          getYearMonth(dueOn),
          rule.note,
          timestamp,
          timestamp,
        ),
    ),
  };
}

export async function generateSchedulesForRule(
  binding: D1Database,
  rule: RecurringRule,
  throughMonth: string,
): Promise<number> {
  if (rule.status !== 'active') return 0;
  const timestamp = nowIso();
  const prepared = prepareScheduleStatements(binding, rule, throughMonth, timestamp);
  const updateRule = binding
    .prepare(
      'UPDATE recurring_rules SET generated_through_month = ?, updated_at = ? WHERE id = ? AND user_id = ?',
    )
    .bind(throughMonth, timestamp, rule.id, rule.userId);
  await binding.batch([...prepared.statements, updateRule]);
  return prepared.count;
}

export async function generateSchedulesForActiveRules(
  binding: D1Database,
  db: Database,
  currentMonth: string,
  limit = 200,
): Promise<number> {
  const throughMonth = scheduleHorizon(currentMonth);
  const rules = await db
    .select()
    .from(recurringRules)
    .where(
      and(
        eq(recurringRules.status, 'active'),
        or(
          isNull(recurringRules.generatedThroughMonth),
          lt(recurringRules.generatedThroughMonth, throughMonth),
        ),
      ),
    )
    .limit(limit);
  let generated = 0;
  for (const rule of rules)
    generated += await generateSchedulesForRule(binding, rule, throughMonth);
  return generated;
}

export async function markOverdue(db: Database, today: string): Promise<void> {
  await db
    .update(scheduledCashflows)
    .set({ status: 'overdue', updatedAt: nowIso() })
    .where(and(eq(scheduledCashflows.status, 'planned'), lt(scheduledCashflows.dueOn, today)));
}
