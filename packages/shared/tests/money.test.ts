import { describe, expect, it } from 'vitest';

import { formatYen } from '../src/money';

describe('formatYen', () => {
  it('formats an integer amount as Japanese yen', () => {
    expect(formatYen(12_345)).toBe('￥12,345');
  });

  it('rejects fractional yen amounts', () => {
    expect(() => formatYen(1.5)).toThrow(RangeError);
  });
});
