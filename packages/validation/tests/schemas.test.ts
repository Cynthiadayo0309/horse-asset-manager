import { describe, expect, it } from 'vitest';

import {
  analyticsQuerySchema,
  categoryUpdateSchema,
  dateStringSchema,
  horseDeleteSchema,
  horseUpdateSchema,
  investmentCreateSchema,
  paginationQuerySchema,
  recurringRuleUpdateSchema,
  simulationItemUpdateSchema,
  simulationScenarioUpdateSchema,
  statementImportCreateSchema,
  yearMonthSchema,
  yenAmountSchema,
} from '../src/schemas';

describe('shared validation schemas', () => {
  it('applies safe pagination defaults', () => {
    expect(paginationQuerySchema.parse({})).toEqual({ page: 1, pageSize: 20 });
  });

  it('rejects fractional yen amounts', () => {
    expect(yenAmountSchema.safeParse(100.5).success).toBe(false);
  });

  it('accepts only a YYYY-MM shape', () => {
    expect(yearMonthSchema.safeParse('2026-08').success).toBe(true);
    expect(yearMonthSchema.safeParse('2026-8').success).toBe(false);
  });

  it('rejects calendar dates that do not exist', () => {
    expect(dateStringSchema.safeParse('2026-02-29').success).toBe(false);
    expect(dateStringSchema.safeParse('2028-02-29').success).toBe(true);
  });

  it('rejects a reversed analytics period', () => {
    expect(analyticsQuerySchema.safeParse({ from: '2026-12-01', to: '2026-01-01' }).success).toBe(
      false,
    );
  });

  it('accepts an investment total calculated from the unit price and shares', () => {
    expect(
      investmentCreateSchema.safeParse({
        horseId: 1,
        shares: 2,
        unitPriceYen: 160_000,
        committedAmountYen: 320_000,
      }).success,
    ).toBe(true);
  });

  it('rejects an investment total that differs from the unit price and shares', () => {
    const result = investmentCreateSchema.safeParse({
      horseId: 1,
      shares: 1,
      unitPriceYen: 16,
      committedAmountYen: 160_000,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]).toMatchObject({ path: ['committedAmountYen'] });
    }
  });

  it('accepts only a non-empty confirmation name for horse deletion', () => {
    expect(horseDeleteSchema.safeParse({ confirmationName: 'ロードデルフィロ' }).success).toBe(
      true,
    );
    expect(horseDeleteSchema.safeParse({ confirmationName: '' }).success).toBe(false);
    expect(
      horseDeleteSchema.safeParse({ confirmationName: 'ロードデルフィロ', unexpected: true })
        .success,
    ).toBe(false);
  });

  it('rejects an unknown horse status', () => {
    expect(horseUpdateSchema.safeParse({ status: 'unknown' }).success).toBe(false);
  });

  it('does not inject create defaults into partial updates', () => {
    expect(categoryUpdateSchema.parse({ name: '変更' })).toEqual({ name: '変更' });
    expect(horseUpdateSchema.parse({ name: '変更後' })).toEqual({ name: '変更後' });
    expect(recurringRuleUpdateSchema.parse({ title: '変更' })).toEqual({ title: '変更' });
    expect(simulationScenarioUpdateSchema.parse({ name: '変更' })).toEqual({ name: '変更' });
    expect(simulationItemUpdateSchema.parse({ title: '変更' })).toEqual({ title: '変更' });
  });

  it('accepts a statement import when the item totals match', () => {
    expect(statementImportCreateSchema.safeParse(statementImportFixture()).success).toBe(true);
  });

  it('rejects a statement import when the item totals differ', () => {
    expect(
      statementImportCreateSchema.safeParse({
        ...statementImportFixture(),
        expectedExpenseYen: 1_500,
      }).success,
    ).toBe(false);
  });
});

function statementImportFixture() {
  return {
    sourceType: 'lord',
    destination: 'confirmed',
    documentHash: 'a'.repeat(64),
    targetMonth: '2026-06',
    expectedExpenseYen: 1_400,
    expectedIncomeYen: 0,
    items: [
      {
        sourceLineKey: 'lord:0:maintenance',
        horseId: 1,
        clubId: 1,
        categoryId: 1,
        direction: 'expense',
        title: 'テストホース 維持費',
        amountYen: 1_400,
        effectiveOn: '2026-08-03',
        targetMonth: '2026-06',
      },
    ],
  };
}
