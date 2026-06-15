import { describe, expect, it } from 'vitest';
import { getAuditLogDiffRows } from './auditLogDisplay.logic';

describe('getAuditLogDiffRows', () => {
  it('flattens nested objects and arrays while ignoring stable object key order', () => {
    expect(
      getAuditLogDiffRows({
        oldRow: {
          empty: [],
          items: [{ label: 'a' }, { label: 'b' }],
          meta: {
            sameObject: { b: 2, a: 1 },
            status: 'draft',
          },
          name: 'Old name',
        },
        newRow: {
          empty: [],
          items: [{ label: 'a' }, { label: 'c' }],
          meta: {
            sameObject: { a: 1, b: 2 },
            status: 'approved',
          },
          name: 'New name',
        },
      }),
    ).toEqual([
      {
        path: 'items[1].label',
        oldValue: 'b',
        newValue: 'c',
      },
      {
        path: 'meta.status',
        oldValue: 'draft',
        newValue: 'approved',
      },
      {
        path: 'name',
        oldValue: 'Old name',
        newValue: 'New name',
      },
    ]);
  });

  it('keeps empty containers as diffable values when they are removed', () => {
    expect(
      getAuditLogDiffRows({
        oldRow: {
          details: {},
          tags: [],
        },
        newRow: {},
      }),
    ).toEqual([
      {
        path: 'details',
        oldValue: {},
        newValue: undefined,
      },
      {
        path: 'tags',
        oldValue: [],
        newValue: undefined,
      },
    ]);
  });
});
