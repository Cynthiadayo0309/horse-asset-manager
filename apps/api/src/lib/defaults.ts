export const defaultCategories = [
  ['出資金', 'expense', 'investment_principal'],
  ['維持費', 'expense', 'maintenance'],
  ['クラブ会費', 'expense', 'club_fee'],
  ['保険料', 'expense', 'insurance'],
  ['手数料', 'expense', 'fee'],
  ['その他支出', 'expense', 'other_expense'],
  ['賞金分配', 'income', 'prize_distribution'],
  ['出走手当', 'income', 'race_allowance'],
  ['奨励金', 'income', 'incentive'],
  ['売却代金', 'income', 'sale_proceeds'],
  ['保険金', 'income', 'insurance_proceeds'],
  ['引退精算金', 'income', 'retirement_settlement'],
  ['返還金', 'income', 'refund'],
  ['その他入金', 'income', 'other_income'],
] as const;

export const defaultAlertRules = [
  ['due_date', { daysBefore: 7 }],
  ['deadline', { daysBefore: 14 }],
  ['budget', { warningPercent: 90, errorPercent: 100 }],
  ['input_missing', { daysAfter: 7 }],
  ['concentration', { thresholdPercent: 50 }],
] as const;
