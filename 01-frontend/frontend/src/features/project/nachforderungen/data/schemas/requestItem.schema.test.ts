import { describe, expect, it } from 'vitest';

import {
  getRequestItemSourceItemId,
  getRequestItemSourceRef,
  getRequestItemSourceType,
} from './requestItem.schema';

describe('getRequestItemSourceRef', () => {
  it('returns sourceRef directly when present', () => {
    const item = {
      sourceRef: { type: 'materialNorm' as const, itemId: 'norm-1' },
    };

    expect(getRequestItemSourceRef(item)).toEqual({
      type: 'materialNorm',
      itemId: 'norm-1',
    });
  });

  it('returns undefined when sourceRef is missing', () => {
    expect(getRequestItemSourceRef({})).toBeUndefined();
  });
});

describe('getRequestItemSourceType', () => {
  it('returns the source type from sourceRef', () => {
    const item = {
      sourceRef: { type: 'contradiction' as const, itemId: 'c-1' },
    };

    expect(getRequestItemSourceType(item)).toBe('contradiction');
  });

  it('returns undefined when no source info exists', () => {
    expect(getRequestItemSourceType({})).toBeUndefined();
  });
});

describe('getRequestItemSourceItemId', () => {
  it('returns the item ID from sourceRef', () => {
    const item = {
      sourceRef: { type: 'materialSatz' as const, itemId: 's-1' },
    };

    expect(getRequestItemSourceItemId(item)).toBe('s-1');
  });

  it('returns undefined when no item ID exists', () => {
    expect(getRequestItemSourceItemId({})).toBeUndefined();
  });
});
