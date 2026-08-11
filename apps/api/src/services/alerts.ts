import { alertRules, createDatabase, notifications, sessions } from '@horse-asset-manager/database';
import { nowIso, todayInJapan } from '@horse-asset-manager/shared';
import { eq, lt } from 'drizzle-orm';

import type { Env } from '../types';
import { generateSchedulesForActiveRules, markOverdue } from './schedules';

interface RuleCondition {
  daysBefore?: number;
  daysAfter?: number;
  warningPercent?: number;
  errorPercent?: number;
  thresholdPercent?: number;
}

interface AlertCandidate {
  userId: number;
  ruleId: number;
  dedupeKey: string;
  title: string;
  message: string;
  severity: 'info' | 'warning' | 'error';
}

export async function runDailyMaintenance(
  env: Env,
  now = new Date(),
): Promise<{ generated: number; alerts: number }> {
  const db = createDatabase(env.DB);
  const today = todayInJapan(now);
  await markOverdue(db, today);
  const generated = await generateSchedulesForActiveRules(env.DB, db, today.slice(0, 7));
  await db.delete(sessions).where(lt(sessions.expiresAt, nowIso(now)));
  const rules = await db.select().from(alertRules).where(eq(alertRules.isEnabled, true)).limit(500);
  let alerts = 0;
  for (const rule of rules) {
    const condition = safeCondition(rule.conditionJson);
    const candidates = await candidatesForRule(
      env.DB,
      rule.userId,
      rule.id,
      rule.ruleType,
      condition,
      today,
    );
    for (const candidate of candidates) {
      await db
        .insert(notifications)
        .values({
          userId: candidate.userId,
          alertRuleId: candidate.ruleId,
          dedupeKey: candidate.dedupeKey,
          title: candidate.title,
          message: candidate.message,
          severity: candidate.severity,
          isRead: false,
          readAt: null,
          createdAt: nowIso(now),
        })
        .onConflictDoNothing();
      alerts += 1;
    }
  }
  return { generated, alerts };
}

function safeCondition(value: string): RuleCondition {
  try {
    const result = JSON.parse(value) as RuleCondition;
    return result && typeof result === 'object' ? result : {};
  } catch {
    return {};
  }
}

async function candidatesForRule(
  db: D1Database,
  userId: number,
  ruleId: number,
  ruleType: string,
  condition: RuleCondition,
  today: string,
): Promise<AlertCandidate[]> {
  if (ruleType === 'due_date') {
    const until = addDays(today, condition.daysBefore ?? 7);
    const result = await db
      .prepare(
        "SELECT id, title, due_on FROM scheduled_cashflows WHERE user_id = ? AND status = 'planned' AND due_on BETWEEN ? AND ? LIMIT 100",
      )
      .bind(userId, today, until)
      .all<{ id: number; title: string; due_on: string }>();
    return result.results.map((row) => ({
      userId,
      ruleId,
      dedupeKey: `due:${row.id}:${row.due_on}`,
      title: '支払期限が近づいています',
      message: `${row.title}（${row.due_on}）`,
      severity: 'warning',
    }));
  }
  if (ruleType === 'deadline') {
    const until = addDays(today, condition.daysBefore ?? 14);
    const result = await db
      .prepare(
        "SELECT id, name, application_deadline FROM horses WHERE user_id = ? AND status IN ('considering','applied') AND application_deadline BETWEEN ? AND ? LIMIT 100",
      )
      .bind(userId, today, until)
      .all<{ id: number; name: string; application_deadline: string }>();
    return result.results.map((row) => ({
      userId,
      ruleId,
      dedupeKey: `deadline:${row.id}:${row.application_deadline}`,
      title: '募集締切が近づいています',
      message: `${row.name}（${row.application_deadline}）`,
      severity: 'warning',
    }));
  }
  if (ruleType === 'input_missing') {
    const before = addDays(today, -(condition.daysAfter ?? 7));
    const result = await db
      .prepare(
        "SELECT id, title, due_on FROM scheduled_cashflows WHERE user_id = ? AND status = 'overdue' AND due_on <= ? LIMIT 100",
      )
      .bind(userId, before)
      .all<{ id: number; title: string; due_on: string }>();
    return result.results.map((row) => ({
      userId,
      ruleId,
      dedupeKey: `missing:${row.id}:${today.slice(0, 7)}`,
      title: '実績が未登録です',
      message: `${row.title}の実績を確認してください。`,
      severity: 'warning',
    }));
  }
  if (ruleType === 'budget') {
    const year = today.slice(0, 4);
    const summary = await db
      .prepare(
        `SELECT b.amount_yen AS budgetYen,
        COALESCE((SELECT SUM(amount_yen) FROM cashflows WHERE user_id = ? AND direction = 'expense' AND status = 'confirmed' AND target_month LIKE ?), 0) AS actualYen,
        COALESCE((SELECT SUM(amount_yen) FROM scheduled_cashflows WHERE user_id = ? AND direction = 'expense' AND status IN ('planned','overdue') AND target_month LIKE ?), 0) AS scheduledYen
       FROM budgets b WHERE b.user_id = ? AND b.budget_type = 'yearly' AND b.period_key = ?`,
      )
      .bind(userId, `${year}%`, userId, `${year}%`, userId, year)
      .first<{ budgetYen: number; actualYen: number; scheduledYen: number }>();
    if (!summary || summary.budgetYen <= 0) return [];
    const percent = ((summary.actualYen + summary.scheduledYen) / summary.budgetYen) * 100;
    const threshold = condition.warningPercent ?? 90;
    if (percent < threshold) return [];
    return [
      {
        userId,
        ruleId,
        dedupeKey: `budget:${year}:${percent >= (condition.errorPercent ?? 100) ? 'error' : 'warning'}`,
        title:
          percent >= (condition.errorPercent ?? 100)
            ? '年間予算を超過しています'
            : '年間予算に近づいています',
        message: `年間予算の使用見込みは${Math.round(percent * 10) / 10}%です。`,
        severity: percent >= (condition.errorPercent ?? 100) ? 'error' : 'warning',
      },
    ];
  }
  if (ruleType === 'concentration') {
    const year = today.slice(0, 4);
    const result = await db
      .prepare(
        `SELECT cl.id, cl.name, SUM(cf.amount_yen) AS clubYen,
        (SELECT SUM(amount_yen) FROM cashflows WHERE user_id = ? AND direction = 'expense' AND status = 'confirmed' AND target_month LIKE ?) AS totalYen
       FROM cashflows cf JOIN clubs cl ON cl.id = cf.club_id
       WHERE cf.user_id = ? AND cf.direction = 'expense' AND cf.status = 'confirmed' AND cf.target_month LIKE ?
       GROUP BY cl.id, cl.name ORDER BY clubYen DESC LIMIT 10`,
      )
      .bind(userId, `${year}%`, userId, `${year}%`)
      .all<{ id: number; name: string; clubYen: number; totalYen: number }>();
    const threshold = condition.thresholdPercent ?? 50;
    return result.results
      .filter((row) => row.totalYen > 0 && (row.clubYen / row.totalYen) * 100 >= threshold)
      .map((row) => ({
        userId,
        ruleId,
        dedupeKey: `concentration:${year}:${row.id}`,
        title: 'クラブへの支出が集中しています',
        message: `${row.name}への支出割合は${Math.round((row.clubYen / row.totalYen) * 1000) / 10}%です。`,
        severity: 'info',
      }));
  }
  return [];
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
