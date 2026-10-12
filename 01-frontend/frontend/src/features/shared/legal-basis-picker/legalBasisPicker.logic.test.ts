import { describe, expect, it } from 'vitest';

import { parentSelectionState } from './legalBasisPicker.logic';

describe('parentSelectionState', () => {
  it('does not mark a partial paginated law as fully selected', () => {
    expect(
      parentSelectionState({
        selectedCount: 2,
        totalCount: 2,
        isComplete: false,
      }),
    ).toBe('indeterminate');
  });

  it('is checked only when every loaded norm is selected and the law is complete', () => {
    expect(
      parentSelectionState({
        selectedCount: 2,
        totalCount: 2,
        isComplete: true,
      }),
    ).toBe('checked');
  });

  it('is unchecked when nothing is selected', () => {
    expect(
      parentSelectionState({
        selectedCount: 0,
        totalCount: 4,
        isComplete: true,
      }),
    ).toBe('unchecked');
  });
});
