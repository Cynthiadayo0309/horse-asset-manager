import type { HorseStatus } from '@horse-asset-manager/shared';

export type Direction = 'expense' | 'income';

export interface User {
  id: number;
  email: string;
  name: string;
  role: 'user' | 'admin';
  setupCompleted: boolean;
}

export interface Club {
  id: number;
  name: string;
  shortName: string | null;
  description: string | null;
  status: HorseStatus;
}

export interface Category {
  id: number;
  name: string;
  categoryType: Direction;
  systemCode: string | null;
  sortOrder: number;
}

export interface Horse {
  id: number;
  clubId: number | null;
  name: string;
  nameKana: string | null;
  aliases?: string[];
  recruitmentYear: number | null;
  unitPriceYen: number | null;
  plannedShares: number | null;
  initialPaymentYen: number | null;
  expectedMonthlyCostYen: number | null;
  applicationDeadline: string | null;
  status: string;
  note: string | null;
  retiredOn: string | null;
  settledOn: string | null;
  investment?: Investment | null;
}

export interface Investment {
  id: number;
  horseId: number;
  shares: number;
  unitPriceYen: number;
  committedAmountYen: number;
  joinedOn: string | null;
}

export interface Cashflow {
  id: number;
  horseId: number | null;
  clubId: number | null;
  categoryId: number;
  direction: Direction;
  title: string;
  amountYen: number;
  occurredOn: string;
  targetMonth: string;
  status: string;
  note: string | null;
}

export interface ScheduledCashflow {
  id: number;
  recurringRuleId: number | null;
  horseId: number | null;
  clubId: number | null;
  categoryId: number;
  direction: Direction;
  title: string;
  amountYen: number;
  dueOn: string;
  targetMonth: string;
  status: 'planned' | 'paid' | 'cancelled' | 'overdue';
}

export interface RecurringRule {
  id: number;
  title: string;
  amountYen: number;
  frequency: 'monthly' | 'yearly' | 'once';
  dayOfMonth: number;
  startMonth: string;
  endMonth: string | null;
  status: string;
}

export interface Reconciliation {
  id: number;
  scheduledCashflowId: number | null;
  cashflowId: number | null;
  matchType: 'exact' | 'difference' | 'missing_actual' | 'unplanned_actual';
  differenceYen: number | null;
  reason: string | null;
  status: 'open' | 'resolved';
  scheduledTitle: string | null;
  scheduledAmountYen: number | null;
  scheduledDueOn: string | null;
  actualTitle: string | null;
  actualAmountYen: number | null;
  actualOccurredOn: string | null;
}

export interface Budget {
  id: number;
  budgetType: 'monthly' | 'yearly';
  periodKey: string;
  amountYen: number;
}

export interface DashboardSummary {
  targetMonth: string;
  scheduledExpenseYen: number;
  actualExpenseYen: number;
  incomeYen: number;
  netYen: number;
  yearlyProjectedExpenseYen: number;
  yearlyRemainingBudgetYen: number | null;
  availableInvestmentYen: number | null;
  budgetUsageRate: number | null;
  isOverBudget: boolean;
  unreadNotifications: number;
}

export interface RecoverySummary {
  expenseYen: number;
  incomeYen: number;
  investmentPrincipalYen: number;
  profitLossYen: number;
  principalRecoveryRate: number | null;
  totalRecoveryRate: number | null;
}

export interface AnalyticsRow extends RecoverySummary {
  id?: number;
  name?: string;
  period?: string;
}

export interface NotificationItem {
  id: number;
  title: string;
  message: string;
  severity: 'info' | 'warning' | 'error';
  isRead: boolean;
  createdAt: string;
}

export interface SimulationScenario {
  id: number;
  name: string;
  description: string | null;
  startMonth: string;
  assumedPeriodMonths: number;
  items?: SimulationItem[];
}

export interface SimulationItem {
  id: number;
  title: string;
  shares: number;
  initialAmountYen: number;
  monthlyAmountYen: number;
  annualAmountYen: number;
}

export interface Settlement {
  id: number;
  horseId: number;
  settlementType: string;
  direction: Direction;
  amountYen: number;
  plannedOn: string | null;
  settledOn: string | null;
  status: string;
  cashflowId: number | null;
}
