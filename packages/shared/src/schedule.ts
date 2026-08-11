import { addMonths, dateForMonth } from './date';

export type RecurringFrequency = 'monthly' | 'yearly' | 'once';

export interface RecurrenceInput {
  frequency: RecurringFrequency;
  startMonth: string;
  endMonth?: string | null;
  dayOfMonth: number;
}

export function generateOccurrenceDates(rule: RecurrenceInput, throughMonth: string): string[] {
  const dates: string[] = [];
  let cursor = rule.startMonth;
  const upperBound = rule.endMonth && rule.endMonth < throughMonth ? rule.endMonth : throughMonth;

  while (cursor <= upperBound) {
    const offset = monthDifference(rule.startMonth, cursor);
    const shouldGenerate =
      rule.frequency === 'monthly' ||
      (rule.frequency === 'yearly' && offset % 12 === 0) ||
      (rule.frequency === 'once' && offset === 0);
    if (shouldGenerate) dates.push(dateForMonth(cursor, rule.dayOfMonth));
    if (rule.frequency === 'once') break;
    cursor = addMonths(cursor, 1);
  }
  return dates;
}

function monthDifference(from: string, to: string): number {
  const [fromYear, fromMonth] = from.split('-').map(Number);
  const [toYear, toMonth] = to.split('-').map(Number);
  if (!fromYear || !fromMonth || !toYear || !toMonth) throw new RangeError('年月が不正です。');
  return (toYear - fromYear) * 12 + toMonth - fromMonth;
}
