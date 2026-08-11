const yenFormatter = new Intl.NumberFormat('ja-JP', {
  style: 'currency',
  currency: 'JPY',
  maximumFractionDigits: 0,
});

export function formatYen(amountYen: number): string {
  if (!Number.isSafeInteger(amountYen)) {
    throw new RangeError('金額は円単位の安全な整数で指定してください。');
  }

  return yenFormatter.format(amountYen);
}
