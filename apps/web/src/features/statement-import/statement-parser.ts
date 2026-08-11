export type StatementSourceType = 'lord' | 'silk';

export interface PdfTextItem {
  text: string;
  x: number;
  y: number;
}

export interface ParsedStatementItem {
  sourceLineKey: string;
  direction: 'expense' | 'income';
  title: string;
  amountYen: number;
  horseLabel: string | null;
  categorySystemCode: string;
}

export interface ParsedStatement {
  sourceType: StatementSourceType;
  issuer: string;
  targetMonth: string;
  effectiveOn: string;
  expectedExpenseYen: number;
  expectedIncomeYen: number;
  items: ParsedStatementItem[];
}

interface TextRow {
  y: number;
  items: PdfTextItem[];
  text: string;
}

export function parseStatement(items: PdfTextItem[]): ParsedStatement {
  const rows = groupRows(items);
  const text = rows.map((row) => row.text).join('\n');
  if (text.includes('ロードサラブレッドオーナーズ')) return parseLord(rows);
  if (text.includes('シルク・ホースクラブ')) return parseSilk(rows);
  throw new Error(
    'このPDF形式には対応していません。シルクまたはロードの対象帳票を選んでください。',
  );
}

export function normalizeHorseName(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/[\s・･ー―‐-]/g, '')
    .toLocaleLowerCase('ja');
}

export function findMatchingHorseIds(
  label: string,
  horses: Array<{ id: number; name: string; aliases?: string[] | undefined }>,
): number[] {
  const normalized = normalizeHorseName(label);
  return horses
    .filter((horse) =>
      [horse.name, ...(horse.aliases ?? [])].some(
        (candidate) => normalizeHorseName(candidate) === normalized,
      ),
    )
    .map((horse) => horse.id);
}

function groupRows(items: PdfTextItem[]): TextRow[] {
  const rows: Array<{ y: number; items: PdfTextItem[] }> = [];
  for (const item of items.filter((item) => item.text.trim())) {
    const row = rows.find((candidate) => Math.abs(candidate.y - item.y) <= 2.5);
    if (row) row.items.push(item);
    else rows.push({ y: item.y, items: [item] });
  }
  return rows
    .map((row) => {
      const sorted = [...row.items].sort((left, right) => left.x - right.x);
      return { y: row.y, items: sorted, text: sorted.map((item) => item.text).join(' ') };
    })
    .sort((left, right) => right.y - left.y);
}

function parseLord(rows: TextRow[]): ParsedStatement {
  const compact = compactText(rows);
  const target = compact.match(/(\d{4})年(\d{1,2})月分/);
  const debit = compact.match(/(\d{4})年(\d{1,2})月(\d{1,2})日振替口座/);
  const totalRow = rows.find((row) => row.text.includes('合計請求金額'));
  const expectedExpenseYen = lastAmount(totalRow?.items ?? []);
  if (!target || !debit || expectedExpenseYen == null) {
    throw new Error('ロード請求書の対象月、振替日、または合計金額を読み取れませんでした。');
  }

  const header = rows.find((row) => row.text.includes('出資馬名'));
  const footer = rows.find(
    (row) => row.y < (header?.y ?? Number.POSITIVE_INFINITY) && row.text.trim().startsWith('合計'),
  );
  if (!header || !footer) throw new Error('ロード請求書の明細表を読み取れませんでした。');

  const result: ParsedStatementItem[] = [];
  const detailRows = rows.filter((row) => row.y < header.y - 4 && row.y > footer.y + 4);
  detailRows.forEach((row, rowIndex) => {
    const name = row.items
      .filter((item) => item.x < 180)
      .map((item) => item.text)
      .join('')
      .trim();
    const total = amountInRange(row.items, 510, Number.POSITIVE_INFINITY);
    if (!name || total == null || total <= 0) return;
    const clubFee = name.includes('会費');
    const horseLabel = clubFee ? null : name;
    const columns = [
      { key: 'investment', min: 220, max: 275, code: 'investment_principal', label: '出資金' },
      { key: 'maintenance', min: 275, max: 335, code: 'maintenance', label: '維持費' },
      { key: 'insurance', min: 335, max: 395, code: 'insurance', label: '保険料' },
      {
        key: 'other',
        min: 395,
        max: 455,
        code: clubFee ? 'club_fee' : 'other_expense',
        label: clubFee ? 'クラブ会費' : 'その他支出',
      },
      { key: 'tax', min: 455, max: 510, code: 'fee', label: '消費税' },
    ] as const;
    for (const column of columns) {
      const amountYen = amountInRange(row.items, column.min, column.max);
      if (amountYen == null || amountYen <= 0) continue;
      result.push({
        sourceLineKey: `lord:${rowIndex}:${column.key}`,
        direction: 'expense',
        title: horseLabel ? `${horseLabel} ${column.label}` : `${name} ${column.label}`,
        amountYen,
        horseLabel,
        categorySystemCode: column.code,
      });
    }
  });

  if (!result.length) throw new Error('ロード請求書に登録可能な明細がありません。');
  return {
    sourceType: 'lord',
    issuer: 'ロードサラブレッドオーナーズ',
    targetMonth: toMonth(target[1], target[2]),
    effectiveOn: toDate(debit[1], debit[2], debit[3]),
    expectedExpenseYen,
    expectedIncomeYen: 0,
    items: result,
  };
}

function parseSilk(rows: TextRow[]): ParsedStatement {
  const compact = compactText(rows);
  const target = compact.match(/【(\d{4})年(\d{1,2})月分】/);
  const issued = compact.match(/発行日(\d{4})年(\d{1,2})月(\d{1,2})日/);
  const settlement = compact.match(/(\d{1,2})月(\d{1,2})日のご精算金額/);
  const summaryHeader = rows.find(
    (row) => row.text.includes('収入額') && row.text.includes('支出額'),
  );
  const summary = rows.find(
    (row) =>
      summaryHeader &&
      row.y < summaryHeader.y - 4 &&
      row.y > summaryHeader.y - 40 &&
      row.items.some((item) => parseAmount(item.text) != null),
  );
  const expectedIncomeYen = amountInRange(summary?.items ?? [], 0, 220) ?? 0;
  const expectedExpenseYen = amountInRange(summary?.items ?? [], 220, 400) ?? 0;
  if (!target || !issued || !settlement || !summaryHeader || !summary) {
    throw new Error('シルク精算書の対象月、精算日、または合計金額を読み取れませんでした。');
  }

  const issuedYear = Number(issued[1]);
  const issuedMonth = Number(issued[2]);
  const settlementMonth = Number(settlement[1]);
  const effectiveYear = settlementMonth < issuedMonth - 6 ? issuedYear + 1 : issuedYear;
  const result: ParsedStatementItem[] = [];
  const outsideHeader = rows.find(
    (row) => row.text.includes('日付') && row.text.includes('摘要') && row.text.includes('金額'),
  );
  const taxRow = rows.find((row) => row.text.includes('課税対象額') && row.text.includes('消費税'));
  if (outsideHeader && taxRow) {
    const outsideRows = rows.filter((row) => row.y < outsideHeader.y - 4 && row.y > taxRow.y + 4);
    outsideRows.forEach((row, rowIndex) => {
      const dateItem = row.items.find((item) => /\d{4}\/\d{1,2}\/\d{1,2}/.test(item.text));
      const amountYen = amountInRange(row.items, 500, Number.POSITIVE_INFINITY);
      if (!dateItem || amountYen == null || amountYen <= 0) return;
      const title = row.items
        .filter((item) => item.x > 120 && item.x < 500)
        .map((item) => item.text)
        .join('')
        .trim();
      result.push({
        sourceLineKey: `silk:outside:${rowIndex}`,
        direction: 'expense',
        title: title || 'ファンド外支出',
        amountYen,
        horseLabel: null,
        categorySystemCode: title.includes('会費') ? 'club_fee' : 'other_expense',
      });
    });
    const taxYen = amountInRange(taxRow.items, 500, Number.POSITIVE_INFINITY);
    if (taxYen != null && taxYen > 0) {
      result.push({
        sourceLineKey: 'silk:outside:tax',
        direction: 'expense',
        title: '消費税',
        amountYen: taxYen,
        horseLabel: null,
        categorySystemCode: 'fee',
      });
    }
  }

  const horseHeader = rows.find(
    (row) =>
      row.text.includes('馬名') && row.text.includes('分配金額') && row.text.includes('請求金額'),
  );
  const horseFooter = rows
    .filter((row) => horseHeader && row.y < horseHeader.y && row.text.trim().startsWith('合計'))
    .at(-1);
  if (horseHeader && horseFooter) {
    const horseRows = rows.filter((row) => row.y < horseHeader.y - 4 && row.y > horseFooter.y + 4);
    horseRows.forEach((row, rowIndex) => {
      const horseLabel = row.items
        .filter((item) => item.x >= 120 && item.x < 350)
        .map((item) => item.text)
        .join('')
        .trim();
      if (!horseLabel) return;
      const incomeYen = amountInRange(row.items, 350, 450) ?? 0;
      const expenseYen = amountInRange(row.items, 450, Number.POSITIVE_INFINITY) ?? 0;
      if (incomeYen > 0) {
        result.push({
          sourceLineKey: `silk:horse:${rowIndex}:income`,
          direction: 'income',
          title: `${horseLabel} 分配金`,
          amountYen: incomeYen,
          horseLabel,
          categorySystemCode: 'prize_distribution',
        });
      }
      if (expenseYen > 0) {
        result.push({
          sourceLineKey: `silk:horse:${rowIndex}:expense`,
          direction: 'expense',
          title: `${horseLabel} 請求額`,
          amountYen: expenseYen,
          horseLabel,
          categorySystemCode: 'other_expense',
        });
      }
    });
  }

  if (!result.length) throw new Error('シルク精算書に登録可能な明細がありません。');
  return {
    sourceType: 'silk',
    issuer: 'シルク・ホースクラブ',
    targetMonth: toMonth(target[1], target[2]),
    effectiveOn: toDate(String(effectiveYear), settlement[1], settlement[2]),
    expectedExpenseYen,
    expectedIncomeYen,
    items: result,
  };
}

function compactText(rows: TextRow[]): string {
  return rows
    .map((row) => row.text)
    .join('')
    .normalize('NFKC')
    .replace(/\s/g, '');
}

function parseAmount(value: string): number | null {
  const normalized = value.normalize('NFKC').replace(/[\s,円()（）]/g, '');
  return /^\d+$/.test(normalized) ? Number(normalized) : null;
}

function amountInRange(items: PdfTextItem[], min: number, max: number): number | null {
  const values = items
    .filter((item) => item.x >= min && item.x < max)
    .map((item) => parseAmount(item.text))
    .filter((value): value is number => value != null);
  return values.at(-1) ?? null;
}

function lastAmount(items: PdfTextItem[]): number | null {
  const values = items
    .map((item) => parseAmount(item.text))
    .filter((value): value is number => value != null);
  return values.at(-1) ?? null;
}

function toMonth(year: string | undefined, month: string | undefined): string {
  return `${year}-${String(Number(month)).padStart(2, '0')}`;
}

function toDate(
  year: string | undefined,
  month: string | undefined,
  day: string | undefined,
): string {
  return `${year}-${String(Number(month)).padStart(2, '0')}-${String(Number(day)).padStart(2, '0')}`;
}
