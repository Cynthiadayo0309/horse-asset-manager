import {
  auditLogs,
  cashflows,
  categories,
  clubs,
  createDatabase,
  horses,
  scheduledCashflows,
  statementImports,
} from '@horse-asset-manager/database';
import { nowIso } from '@horse-asset-manager/shared';
import {
  statementImportCheckQuerySchema,
  statementImportCreateSchema,
} from '@horse-asset-manager/validation';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { Hono, type Context } from 'hono';

import { requireAuth } from '../lib/auth';
import { ApiError, getIp, ok, parseJson, parseValue } from '../lib/http';
import type { AppBindings } from '../types';

export const statementImportRoutes = new Hono<AppBindings>();
statementImportRoutes.use('*', requireAuth);

statementImportRoutes.get('/statement-imports/check', async (c) => {
  const { documentHash } = parseValue(c.req.query(), statementImportCheckQuerySchema);
  const userId = c.get('user').id;
  const row = await createDatabase(c.env.DB)
    .select({ id: statementImports.id })
    .from(statementImports)
    .where(
      and(eq(statementImports.userId, userId), eq(statementImports.documentHash, documentHash)),
    )
    .limit(1);
  return ok(c, { imported: Boolean(row[0]) });
});

statementImportRoutes.post('/statement-imports', async (c) => {
  const input = await parseJson(c, statementImportCreateSchema);
  const user = c.get('user');
  const db = createDatabase(c.env.DB);

  const duplicate = await db
    .select({ id: statementImports.id })
    .from(statementImports)
    .where(
      and(
        eq(statementImports.userId, user.id),
        eq(statementImports.documentHash, input.documentHash),
      ),
    )
    .limit(1);
  if (duplicate[0]) throw duplicateImportError();

  await assertImportOwnership(c, input.items);

  const timestamp = nowIso();
  const importId = sql<number>`(
    SELECT ${statementImports.id}
    FROM ${statementImports}
    WHERE ${statementImports.userId} = ${user.id}
      AND ${statementImports.documentHash} = ${input.documentHash}
  )`;
  const importInsert = db
    .insert(statementImports)
    .values({
      userId: user.id,
      sourceType: input.sourceType,
      documentHash: input.documentHash,
      targetMonth: input.targetMonth,
      destination: input.destination,
      itemCount: input.items.length,
      createdAt: timestamp,
    })
    .returning({ id: statementImports.id });
  const auditInsert = db.insert(auditLogs).values({
    userId: user.id,
    action: 'create',
    entityType: 'statement_imports',
    entityId: null,
    subjectHorseId: null,
    changesJson: JSON.stringify({
      sourceType: input.sourceType,
      destination: input.destination,
      itemCount: input.items.length,
    }),
    ipAddress: getIp(c),
    createdAt: timestamp,
  });

  try {
    if (input.destination === 'confirmed') {
      const [createdImport] = await db.batch([
        importInsert,
        db.insert(cashflows).values(
          input.items.map((item) => ({
            userId: user.id,
            horseId: item.horseId,
            clubId: item.clubId,
            categoryId: item.categoryId,
            statementImportId: importId,
            sourceLineKey: item.sourceLineKey,
            direction: item.direction,
            title: item.title,
            amountYen: item.amountYen,
            occurredOn: item.effectiveOn,
            targetMonth: item.targetMonth,
            paymentMethod: null,
            status: 'confirmed' as const,
            note: null,
            createdAt: timestamp,
            updatedAt: timestamp,
          })),
        ),
        auditInsert,
      ]);
      return ok(
        c,
        {
          importId: createdImport[0]?.id,
          destination: input.destination,
          createdCount: input.items.length,
        },
        'PDFの明細を確定収支へ登録しました。',
        201,
      );
    }

    const [createdImport] = await db.batch([
      importInsert,
      db.insert(scheduledCashflows).values(
        input.items.map((item) => ({
          userId: user.id,
          recurringRuleId: null,
          horseId: item.horseId,
          clubId: item.clubId,
          categoryId: item.categoryId,
          statementImportId: importId,
          sourceLineKey: item.sourceLineKey,
          direction: item.direction,
          title: item.title,
          amountYen: item.amountYen,
          dueOn: item.effectiveOn,
          targetMonth: item.targetMonth,
          status: 'planned' as const,
          note: null,
          createdAt: timestamp,
          updatedAt: timestamp,
        })),
      ),
      auditInsert,
    ]);
    return ok(
      c,
      {
        importId: createdImport[0]?.id,
        destination: input.destination,
        createdCount: input.items.length,
      },
      'PDFの明細を支払い予定へ登録しました。',
      201,
    );
  } catch (error) {
    if (isDuplicateImportError(error)) throw duplicateImportError();
    throw error;
  }
});

async function assertImportOwnership(
  c: Context<AppBindings>,
  items: Array<{
    horseId: number | null;
    clubId: number;
    categoryId: number;
    direction: 'expense' | 'income';
  }>,
) {
  const userId = c.get('user').id;
  const db = createDatabase(c.env.DB);
  const clubIds = [...new Set(items.map((item) => item.clubId))];
  const horseIds = [
    ...new Set(items.flatMap((item) => (item.horseId == null ? [] : [item.horseId]))),
  ];
  const categoryIds = [...new Set(items.map((item) => item.categoryId))];
  const [ownedClubs, ownedHorses, ownedCategories] = await Promise.all([
    db
      .select({ id: clubs.id })
      .from(clubs)
      .where(and(eq(clubs.userId, userId), inArray(clubs.id, clubIds))),
    horseIds.length
      ? db
          .select({ id: horses.id })
          .from(horses)
          .where(and(eq(horses.userId, userId), inArray(horses.id, horseIds)))
      : Promise.resolve([]),
    db
      .select({ id: categories.id, categoryType: categories.categoryType })
      .from(categories)
      .where(and(eq(categories.userId, userId), inArray(categories.id, categoryIds))),
  ]);
  const clubSet = new Set(ownedClubs.map((row) => row.id));
  const horseSet = new Set(ownedHorses.map((row) => row.id));
  const categoryMap = new Map(ownedCategories.map((row) => [row.id, row.categoryType]));
  const invalid = items.some(
    (item) =>
      !clubSet.has(item.clubId) ||
      (item.horseId != null && !horseSet.has(item.horseId)) ||
      categoryMap.get(item.categoryId) !== item.direction,
  );
  if (invalid) {
    throw new ApiError(
      404,
      'IMPORT_REFERENCE_NOT_FOUND',
      '選択された馬、クラブ、またはカテゴリーが見つかりません。',
    );
  }
}

function duplicateImportError() {
  return new ApiError(
    409,
    'STATEMENT_ALREADY_IMPORTED',
    'このPDFはすでに取り込まれています。予定として登録した場合は、予定・実績照合をご利用ください。',
  );
}

function isDuplicateImportError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.message.includes('uq_statement_imports_user_hash') ||
      error.message.includes('statement_imports.user_id, statement_imports.document_hash'))
  );
}
