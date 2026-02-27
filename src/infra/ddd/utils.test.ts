import { describe, expect, it } from 'vitest';

import { assertNever } from './utils.js';

describe('assertNever', () => {
  type Status = 'active' | 'inactive';

  function getStatusLabel(status: Status): string {
    // biome-ignore lint/nursery/noUnnecessaryConditions: Used to test assertNever
    switch (status) {
      case 'active':
        return 'Active';
      case 'inactive':
        return 'Inactive';
      default:
        return assertNever(status);
    }
  }

  it('should not be called when all cases are handled', () => {
    expect(getStatusLabel('active')).toBe('Active');
    expect(getStatusLabel('inactive')).toBe('Inactive');
  });

  it('should throw error when called with unexpected value', () => {
    const unexpectedValue = 'unknown' as never;

    expect(() => assertNever(unexpectedValue)).toThrow('Unexpected value: unknown');
  });
});
