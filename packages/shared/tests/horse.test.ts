import { describe, expect, it } from 'vitest';

import { canTransitionHorseStatus } from '../src/horse';

describe('horse lifecycle', () => {
  it('allows every status to change directly to every other status', () => {
    const statuses = [
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

    for (const from of statuses) {
      for (const to of statuses) {
        expect(canTransitionHorseStatus(from, to)).toBe(true);
      }
    }
  });
});
