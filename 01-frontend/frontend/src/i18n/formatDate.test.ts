import { describe, expect, it } from 'vitest';

import { formatDate, formatDateTime } from './formatDate';

describe('formatDate', () => {
  it('formats German dates with zero-padded day and month', () => {
    expect(formatDate('2026-05-04T00:00:00.000Z')).toBe('04.05.2026');
  });

  it('formats German date-times with explicit locale behavior', () => {
    expect(formatDateTime('2026-05-04T12:34:56', 'de-DE')).toBe(
      '04.05.2026, 12:34:56',
    );
  });
});
