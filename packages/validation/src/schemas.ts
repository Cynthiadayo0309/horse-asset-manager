import { z } from 'zod';

export const directions = ['expense', 'income'] as const;
export const horseStatuses = [
  'considering',
  'applied',
  'invested',
  'active',
  'retired',
  'settling',
  'settled',
  'rejected',
  'skipped',
] as const;
export const recurringFrequencies = ['monthly', 'yearly', 'once'] as const;
export const settlementTypes = [
  'final_cost',
  'sale_proceeds',
  'insurance',
  'refund',
  'retirement_settlement',
  'other',
] as const;
export const alertRuleTypes = [
  'due_date',
  'deadline',
  'budget',
  'input_missing',
  'concentration',
] as const;
export const statementSourceTypes = ['lord', 'silk'] as const;
export const statementImportDestinations = ['scheduled', 'confirmed'] as const;

const datePattern = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/;
const yearPattern = /^\d{4}$/;

export const idSchema = z.coerce.number().int().positive();
export const dateStringSchema = z
  .string()
  .regex(datePattern, '日付はYYYY-MM-DD形式で入力してください。')
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, '存在する日付を入力してください。');
export const yearMonthSchema = z
  .string()
  .regex(monthPattern, '対象年月はYYYY-MM形式で入力してください。');
export const yearSchema = z.string().regex(yearPattern, '年はYYYY形式で入力してください。');
export const yenAmountSchema = z.number().int().safe().nonnegative();
export const optionalYenAmountSchema = yenAmountSchema.nullable().optional();

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const idParamsSchema = z.object({ id: idSchema });
export const horseIdParamsSchema = z.object({ horseId: idSchema });

export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  environment: z.string().min(1),
});

export const registerSchema = z
  .object({
    email: z.email('正しいメールアドレスを入力してください。').max(254),
    name: z.string().trim().min(1).max(100),
    password: z.string().min(12, 'パスワードは12文字以上で入力してください。').max(128),
  })
  .strict();

export const loginSchema = z
  .object({
    email: z.email().max(254),
    password: z.string().min(1).max(128),
  })
  .strict();

export const setupSchema = z
  .object({
    yearlyBudgetYen: yenAmountSchema,
    monthlyBudgetYen: yenAmountSchema,
    clubName: z.union([z.string().trim().min(1).max(100), z.literal('')]).optional(),
  })
  .strict();

export const clubCreateSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    shortName: z.string().trim().max(50).nullable().optional(),
    description: z.string().trim().max(1000).nullable().optional(),
  })
  .strict();
export const clubUpdateSchema = clubCreateSchema.partial().strict();

export const categoryCreateSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    categoryType: z.enum(directions),
    parentId: idSchema.nullable().optional(),
    sortOrder: z.number().int().min(0).max(10_000).default(0),
  })
  .strict();
export const categoryUpdateSchema = categoryCreateSchema
  .partial()
  .extend({ sortOrder: z.number().int().min(0).max(10_000).optional() })
  .strict();

export const horseCreateSchema = z
  .object({
    clubId: idSchema.nullable().optional(),
    name: z.string().trim().min(1).max(100),
    nameKana: z.string().trim().max(100).nullable().optional(),
    gender: z.enum(['male', 'female', 'gelding', 'unknown']).nullable().optional(),
    birthDate: dateStringSchema.nullable().optional(),
    sire: z.string().trim().max(100).nullable().optional(),
    dam: z.string().trim().max(100).nullable().optional(),
    damsire: z.string().trim().max(100).nullable().optional(),
    trainer: z.string().trim().max(100).nullable().optional(),
    recruitmentYear: z.number().int().min(1990).max(2200).nullable().optional(),
    totalPriceYen: optionalYenAmountSchema,
    totalShares: z.number().int().positive().nullable().optional(),
    unitPriceYen: optionalYenAmountSchema,
    plannedShares: z.number().int().positive().nullable().optional(),
    initialPaymentYen: optionalYenAmountSchema,
    expectedMonthlyCostYen: optionalYenAmountSchema,
    expectedInsuranceYen: optionalYenAmountSchema,
    applicationDeadline: dateStringSchema.nullable().optional(),
    status: z.enum(horseStatuses).default('considering'),
    retiredOn: dateStringSchema.nullable().optional(),
    settledOn: dateStringSchema.nullable().optional(),
    note: z.string().trim().max(5000).nullable().optional(),
  })
  .strict();
export const horseUpdateSchema = horseCreateSchema
  .partial()
  .extend({ status: z.enum(horseStatuses).optional() })
  .strict();
export const horseDeleteSchema = z
  .object({
    confirmationName: z.string().min(1).max(100),
  })
  .strict();

export const horseOrderUpdateSchema = z
  .object({
    orderedIds: z.array(idSchema).min(1).max(100),
  })
  .superRefine(({ orderedIds }, context) => {
    if (new Set(orderedIds).size !== orderedIds.length)
      context.addIssue({ code: 'custom', message: '馬IDが重複しています。', path: ['orderedIds'] });
  })
  .strict();

export const horseListQuerySchema = paginationQuerySchema.extend({
  status: z.enum(horseStatuses).optional(),
  clubId: idSchema.optional(),
  search: z.string().trim().max(100).optional(),
});

const investmentBaseSchema = z
  .object({
    horseId: idSchema,
    shares: z.number().int().positive(),
    unitPriceYen: yenAmountSchema,
    committedAmountYen: yenAmountSchema,
    joinedOn: dateStringSchema.nullable().optional(),
    note: z.string().trim().max(2000).nullable().optional(),
    initialCashflow: z
      .object({
        amountYen: yenAmountSchema,
        occurredOn: dateStringSchema,
        targetMonth: yearMonthSchema,
      })
      .nullable()
      .optional(),
  })
  .strict();

export const investmentCreateSchema = investmentBaseSchema.superRefine((value, context) => {
  const expectedAmountYen = value.shares * value.unitPriceYen;
  if (!Number.isSafeInteger(expectedAmountYen)) {
    context.addIssue({
      code: 'custom',
      path: ['committedAmountYen'],
      message: '契約総額が扱える金額の上限を超えています。',
    });
  } else if (value.committedAmountYen !== expectedAmountYen) {
    context.addIssue({
      code: 'custom',
      path: ['committedAmountYen'],
      message: '契約総額は一口価格と出資口数から計算した金額にしてください。',
    });
  }
});
export const investmentUpdateSchema = investmentBaseSchema
  .omit({ horseId: true, initialCashflow: true })
  .partial()
  .strict();

export const budgetCreateSchema = z
  .object({
    budgetType: z.enum(['monthly', 'yearly']),
    periodKey: z.string().refine((value) => yearPattern.test(value) || monthPattern.test(value), {
      message: '期間はYYYYまたはYYYY-MM形式で入力してください。',
    }),
    amountYen: yenAmountSchema,
    note: z.string().trim().max(1000).nullable().optional(),
  })
  .superRefine((value, context) => {
    if (value.budgetType === 'yearly' && !yearPattern.test(value.periodKey)) {
      context.addIssue({
        code: 'custom',
        path: ['periodKey'],
        message: '年間予算はYYYY形式です。',
      });
    }
    if (value.budgetType === 'monthly' && !monthPattern.test(value.periodKey)) {
      context.addIssue({
        code: 'custom',
        path: ['periodKey'],
        message: '月間予算はYYYY-MM形式です。',
      });
    }
  });
export const budgetUpdateSchema = z
  .object({
    amountYen: yenAmountSchema.optional(),
    note: z.string().trim().max(1000).nullable().optional(),
  })
  .strict();

export const cashflowCreateSchema = z
  .object({
    horseId: idSchema.nullable().optional(),
    clubId: idSchema.nullable().optional(),
    categoryId: idSchema,
    direction: z.enum(directions),
    title: z.string().trim().min(1).max(200),
    amountYen: yenAmountSchema,
    occurredOn: dateStringSchema,
    targetMonth: yearMonthSchema,
    paymentMethod: z.string().trim().max(100).nullable().optional(),
    note: z.string().trim().max(2000).nullable().optional(),
    scheduledCashflowId: idSchema.nullable().optional(),
  })
  .strict();
export const cashflowUpdateSchema = cashflowCreateSchema
  .omit({ scheduledCashflowId: true })
  .partial()
  .strict();
export const cashflowListQuerySchema = paginationQuerySchema.extend({
  targetMonth: yearMonthSchema.optional(),
  from: dateStringSchema.optional(),
  to: dateStringSchema.optional(),
  horseId: idSchema.optional(),
  clubId: idSchema.optional(),
  categoryId: idSchema.optional(),
  direction: z.enum(directions).optional(),
});

const documentHashSchema = z.string().regex(/^[a-f0-9]{64}$/, 'PDFの識別情報が不正です。');

export const statementImportCheckQuerySchema = z
  .object({
    documentHash: documentHashSchema,
  })
  .strict();

export const statementImportItemSchema = z
  .object({
    sourceLineKey: z.string().regex(/^[A-Za-z0-9:_-]{1,200}$/),
    horseId: idSchema.nullable(),
    clubId: idSchema,
    categoryId: idSchema,
    direction: z.enum(directions),
    title: z.string().trim().min(1).max(200),
    amountYen: z.number().int().safe().positive(),
    effectiveOn: dateStringSchema,
    targetMonth: yearMonthSchema,
  })
  .strict();

export const statementImportCreateSchema = z
  .object({
    sourceType: z.enum(statementSourceTypes),
    destination: z.enum(statementImportDestinations),
    documentHash: documentHashSchema,
    targetMonth: yearMonthSchema,
    expectedExpenseYen: yenAmountSchema,
    expectedIncomeYen: yenAmountSchema,
    items: z.array(statementImportItemSchema).min(1).max(100),
  })
  .strict()
  .superRefine((value, context) => {
    const expenseYen = value.items
      .filter((item) => item.direction === 'expense')
      .reduce((sum, item) => sum + item.amountYen, 0);
    const incomeYen = value.items
      .filter((item) => item.direction === 'income')
      .reduce((sum, item) => sum + item.amountYen, 0);
    if (expenseYen !== value.expectedExpenseYen) {
      context.addIssue({
        code: 'custom',
        path: ['items'],
        message: '支出明細の合計がPDFの支出合計と一致しません。',
      });
    }
    if (incomeYen !== value.expectedIncomeYen) {
      context.addIssue({
        code: 'custom',
        path: ['items'],
        message: '入金明細の合計がPDFの入金合計と一致しません。',
      });
    }
  });

export const recurringRuleCreateSchema = z
  .object({
    horseId: idSchema.nullable().optional(),
    clubId: idSchema.nullable().optional(),
    categoryId: idSchema,
    direction: z.enum(directions).default('expense'),
    title: z.string().trim().min(1).max(200),
    amountYen: yenAmountSchema,
    frequency: z.enum(recurringFrequencies),
    dayOfMonth: z.number().int().min(1).max(31),
    startMonth: yearMonthSchema,
    endMonth: yearMonthSchema.nullable().optional(),
    note: z.string().trim().max(2000).nullable().optional(),
  })
  .strict();
export const recurringRuleUpdateSchema = recurringRuleCreateSchema
  .partial()
  .extend({ direction: z.enum(directions).optional() })
  .strict();

export const scheduledCashflowCreateSchema = z
  .object({
    horseId: idSchema.nullable().optional(),
    clubId: idSchema.nullable().optional(),
    categoryId: idSchema,
    direction: z.enum(directions),
    title: z.string().trim().min(1).max(200),
    amountYen: yenAmountSchema,
    dueOn: dateStringSchema,
    targetMonth: yearMonthSchema,
    note: z.string().trim().max(2000).nullable().optional(),
  })
  .strict();
export const scheduledCashflowUpdateSchema = scheduledCashflowCreateSchema
  .partial()
  .extend({
    status: z.enum(['planned', 'paid', 'cancelled', 'overdue']).optional(),
  })
  .strict();
export const scheduledListQuerySchema = paginationQuerySchema.extend({
  targetMonth: yearMonthSchema.optional(),
  from: dateStringSchema.optional(),
  to: dateStringSchema.optional(),
  status: z.enum(['planned', 'paid', 'cancelled', 'overdue']).optional(),
});

export const reconciliationCreateSchema = z
  .object({
    scheduledCashflowId: idSchema.nullable().optional(),
    cashflowId: idSchema.nullable().optional(),
    reason: z.string().trim().max(1000).nullable().optional(),
  })
  .refine((value) => value.scheduledCashflowId || value.cashflowId, {
    message: '予定または実績を指定してください。',
  });
export const reconciliationUpdateSchema = z
  .object({
    reason: z.string().trim().max(1000).nullable().optional(),
    status: z.enum(['open', 'resolved']).optional(),
  })
  .strict();

export const simulationScenarioCreateSchema = z
  .object({
    name: z.string().trim().min(1).max(150),
    description: z.string().trim().max(2000).nullable().optional(),
    startMonth: yearMonthSchema,
    assumedPeriodMonths: z.number().int().min(1).max(120).default(12),
  })
  .strict();
export const simulationScenarioUpdateSchema = simulationScenarioCreateSchema
  .partial()
  .extend({ assumedPeriodMonths: z.number().int().min(1).max(120).optional() })
  .strict();
export const simulationItemCreateSchema = z
  .object({
    horseId: idSchema.nullable().optional(),
    title: z.string().trim().min(1).max(150),
    shares: z.number().int().positive().default(1),
    initialAmountYen: yenAmountSchema.default(0),
    monthlyAmountYen: yenAmountSchema.default(0),
    annualAmountYen: yenAmountSchema.default(0),
    note: z.string().trim().max(1000).nullable().optional(),
  })
  .strict();
export const simulationItemUpdateSchema = simulationItemCreateSchema
  .partial()
  .extend({
    shares: z.number().int().positive().optional(),
    initialAmountYen: yenAmountSchema.optional(),
    monthlyAmountYen: yenAmountSchema.optional(),
    annualAmountYen: yenAmountSchema.optional(),
  })
  .strict();

export const settlementCreateSchema = z
  .object({
    settlementType: z.enum(settlementTypes),
    direction: z.enum(directions),
    amountYen: yenAmountSchema,
    plannedOn: dateStringSchema.nullable().optional(),
    note: z.string().trim().max(2000).nullable().optional(),
  })
  .strict();
export const settlementCompleteSchema = z
  .object({
    settledOn: dateStringSchema,
    categoryId: idSchema,
  })
  .strict();

export const alertRuleUpdateSchema = z
  .object({
    condition: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
    isEnabled: z.boolean(),
  })
  .strict();

export const analyticsQuerySchema = z
  .object({
    from: dateStringSchema,
    to: dateStringSchema,
    horseId: idSchema.optional(),
    clubId: idSchema.optional(),
    categoryId: idSchema.optional(),
  })
  .refine(({ from, to }) => from <= to, {
    message: '開始日は終了日以前にしてください。',
  });

export const dashboardQuerySchema = z.object({ targetMonth: yearMonthSchema });
export const exportQuerySchema = analyticsQuerySchema.refine(
  ({ from, to }) => {
    const limit = new Date(`${from}T00:00:00Z`);
    limit.setUTCFullYear(limit.getUTCFullYear() + 5);
    return new Date(`${to}T00:00:00Z`) <= limit;
  },
  { message: 'CSVの期間は最大5年です。' },
);

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type SetupInput = z.infer<typeof setupSchema>;
export type ClubCreateInput = z.infer<typeof clubCreateSchema>;
export type HorseCreateInput = z.infer<typeof horseCreateSchema>;
export type CashflowCreateInput = z.infer<typeof cashflowCreateSchema>;
export type StatementImportInput = z.infer<typeof statementImportCreateSchema>;
export type RecurringRuleCreateInput = z.infer<typeof recurringRuleCreateSchema>;
export type SimulationItemInput = z.infer<typeof simulationItemCreateSchema>;
