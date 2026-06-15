import { describe, expect, it } from 'vitest';

import { compareByName } from './useRequiredDocuments';

describe('compareByName', () => {
  it('sorts document types alphabetically within a category', () => {
    const documents = [{ name: 'Zeta' }, { name: 'beta' }, { name: 'Alpha' }];

    const result = [...documents].sort(compareByName);

    expect(result.map((document) => document.name)).toEqual([
      'Alpha',
      'beta',
      'Zeta',
    ]);
  });
});
