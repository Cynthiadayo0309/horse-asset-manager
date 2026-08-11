import { describe, expect, it } from 'vitest';

import {
  calculateBudgetSummary,
  calculateRecoverySummary,
  calculateSimulation,
} from '../src/finance';

describe('finance calculations', () => {
  it('separates principal and total recovery rates', () => {
    expect(
      calculateRecoverySummary({
        expenseYen: 200_000,
        incomeYen: 100_000,
        investmentPrincipalYen: 80_000,
      }),
    ).toEqual({
      expenseYen: 200_000,
      incomeYen: 100_000,
      investmentPrincipalYen: 80_000,
      profitLossYen: -100_000,
      principalRecoveryRate: 125,
      totalRecoveryRate: 50,
    });
  });

  it('does not offset a budget with income', () => {
    expect(
      calculateBudgetSummary({
        budgetYen: 500_000,
        actualExpenseYen: 200_000,
        outstandingScheduledExpenseYen: 350_000,
      }),
    ).toMatchObject({
      remainingBudgetYen: -50_000,
      availableInvestmentYen: 0,
      isOverBudget: true,
    });
  });

  it('calculates a scenario without persisting cashflows', () => {
    expect(
      calculateSimulation(
        [{ initialAmountYen: 100_000, monthlyAmountYen: 5_000, annualAmountYen: 10_000 }],
        18,
      ),
    ).toEqual({
      initialTotalYen: 100_000,
      monthlyIncreaseYen: 5_000,
      annualAmountYen: 10_000,
      firstYearTotalYen: 170_000,
      periodTotalYen: 210_000,
    });
  });
});
