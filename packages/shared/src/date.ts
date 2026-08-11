const yearMonthPattern = /^(\d{4})-(\d{2})$/;

export function getYearMonth(date: string): string {
  return date.slice(0, 7);
}

export function addMonths(yearMonth: string, months: number): string {
  const match = yearMonthPattern.exec(yearMonth);
  if (!match) throw new RangeError('年月はYYYY-MM形式で指定してください。');
  const year = Number(match[1]);
  const month = Number(match[2]);
  const value = year * 12 + month - 1 + months;
  const resultYear = Math.floor(value / 12);
  const resultMonth = (value % 12) + 1;
  return `${resultYear.toString().padStart(4, '0')}-${resultMonth.toString().padStart(2, '0')}`;
}

export function endOfMonthDay(yearMonth: string): number {
  const [year, month] = yearMonth.split('-').map(Number);
  if (!year || !month) throw new RangeError('年月はYYYY-MM形式で指定してください。');
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function dateForMonth(yearMonth: string, requestedDay: number): string {
  const day = Math.min(Math.max(requestedDay, 1), endOfMonthDay(yearMonth));
  return `${yearMonth}-${day.toString().padStart(2, '0')}`;
}

export function todayInJapan(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function nowIso(now = new Date()): string {
  return now.toISOString();
}

export function daysBetween(left: string, right: string): number {
  const leftDate = Date.parse(`${left}T00:00:00Z`);
  const rightDate = Date.parse(`${right}T00:00:00Z`);
  return Math.round((rightDate - leftDate) / 86_400_000);
}
