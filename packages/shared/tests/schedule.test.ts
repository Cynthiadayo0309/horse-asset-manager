import { describe, expect, it } from 'vitest';

import { generateOccurrenceDates } from '../src/schedule';

describe('generateOccurrenceDates', () => {
  it('clamps a monthly rule to the end of short months', () => {
    expect(
      generateOccurrenceDates(
        { frequency: 'monthly', startMonth: '2026-01', dayOfMonth: 31 },
        '2026-03',
      ),
    ).toEqual(['2026-01-31', '2026-02-28', '2026-03-31']);
  });

  it('generates yearly and once rules idempotently from their start month', () => {
    expect(
      generateOccurrenceDates(
        { frequency: 'yearly', startMonth: '2026-04', dayOfMonth: 10 },
        '2028-04',
      ),
    ).toEqual(['2026-04-10', '2027-04-10', '2028-04-10']);
    expect(
      generateOccurrenceDates(
        { frequency: 'once', startMonth: '2026-04', dayOfMonth: 10 },
        '2028-04',
      ),
    ).toEqual(['2026-04-10']);
  });
});
