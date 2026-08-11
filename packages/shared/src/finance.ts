export interface RecoverySummary {
  expenseYen: number;
  incomeYen: number;
  investmentPrincipalYen: number;
  profitLossYen: number;
  principalRecoveryRate: number | null;
  totalRecoveryRate: number | null;
}

function rate(numerator: number, denominator: number): number | null {
  if (denominator === 0) return null;
  return Math.round((numerator / denominator) * 1_000) / 10;
}

export function calculateRecoverySummary(input: {
  expenseYen: number;
  incomeYen: number;
  investmentPrincipalYen: number;
}): RecoverySummary {
  return {
    ...input,
    profitLossYen: input.incomeYen - input.expenseYen,
    principalRecoveryRate: rate(input.incomeYen, input.investmentPrincipalYen),
    totalRecoveryRate: rate(input.incomeYen, input.expenseYen),
  };
}

export function calculateBudgetSummary(input: {
  budgetYen: number | null;
  actualExpenseYen: number;
  outstandingScheduledExpenseYen: number;
}) {
  const projectedExpenseYen = input.actualExpenseYen + input.outstandingScheduledExpenseYen;
  if (input.budgetYen === null) {
    return {
      budgetYen: null,
      actualExpenseYen: input.actualExpenseYen,
      outstandingScheduledExpenseYen: input.outstandingScheduledExpenseYen,
      projectedExpenseYen,
      remainingBudgetYen: null,
      availableInvestmentYen: null,
      usageRate: null,
      isOverBudget: false,
    };
  }
  const remainingBudgetYen = input.budgetYen - projectedExpenseYen;
  return {
    budgetYen: input.budgetYen,
    actualExpenseYen: input.actualExpenseYen,
    outstandingScheduledExpenseYen: input.outstandingScheduledExpenseYen,
    projectedExpenseYen,
    remainingBudgetYen,
    availableInvestmentYen: Math.max(0, remainingBudgetYen),
    usageRate:
      input.budgetYen === 0
        ? projectedExpenseYen > 0
          ? 100
          : 0
        : Math.round((projectedExpenseYen / input.budgetYen) * 1_000) / 10,
    isOverBudget: projectedExpenseYen > input.budgetYen,
  };
}

export interface SimulationItem {
  initialAmountYen: number;
  monthlyAmountYen: number;
  annualAmountYen: number;
}

export function calculateSimulation(items: SimulationItem[], assumedPeriodMonths: number) {
  const initialTotalYen = items.reduce((sum, item) => sum + item.initialAmountYen, 0);
  const monthlyIncreaseYen = items.reduce((sum, item) => sum + item.monthlyAmountYen, 0);
  const annualAmountYen = items.reduce((sum, item) => sum + item.annualAmountYen, 0);
  const firstYearTotalYen = initialTotalYen + monthlyIncreaseYen * 12 + annualAmountYen;
  const annualOccurrences = Math.ceil(assumedPeriodMonths / 12);
  return {
    initialTotalYen,
    monthlyIncreaseYen,
    annualAmountYen,
    firstYearTotalYen,
    periodTotalYen:
      initialTotalYen +
      monthlyIncreaseYen * assumedPeriodMonths +
      annualAmountYen * annualOccurrences,
  };
}
