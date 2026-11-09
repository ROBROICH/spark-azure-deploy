import { describe, expect, it } from 'vitest';
import { getAuditLogDiffRows } from './auditLogDisplay.logic';

describe('getAuditLogDiffRows', () => {
  it('flattens nested objects and arrays while ignoring stable object key order', () => {
    expect(
      getAuditLogDiffRows({
        entityType: 'project',
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
        kind: 'value',
        path: 'items[1].label',
        oldValue: 'b',
        newValue: 'c',
      },
      {
        kind: 'value',
        path: 'meta.status',
        oldValue: 'draft',
        newValue: 'approved',
      },
      {
        kind: 'value',
        path: 'name',
        oldValue: 'Old name',
        newValue: 'New name',
      },
    ]);
  });

  it('keeps empty containers as diffable values when they are removed', () => {
    expect(
      getAuditLogDiffRows({
        entityType: 'project',
        oldRow: {
          details: {},
          tags: [],
        },
        newRow: {},
      }),
    ).toEqual([
      {
        kind: 'value',
        path: 'details',
        oldValue: {},
        newValue: undefined,
      },
      {
        kind: 'value',
        path: 'tags',
        oldValue: [],
        newValue: undefined,
      },
    ]);
  });
});

describe('getAuditLogDiffRows formatted content', () => {
  const formattedContent = {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Fett' }],
      },
    ],
  };
  const changedFormattedContent = {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', marks: [{ type: 'italic' }], text: 'Neu' }],
      },
    ],
  };
  const formattedContentRow = { kind: 'formattedContent', path: 'content' };

  it.each([
    ['a document change', formattedContent, changedFormattedContent],
    ['a change from no content to a document', null, formattedContent],
    ['a change from a document to no content', formattedContent, null],
  ])(
    'shows one content row without JSON values for %s of a vae_node',
    (_case, oldContent, newContent) => {
      expect(
        getAuditLogDiffRows({
          entityType: 'vae_node',
          oldRow: { content: oldContent, title: 'Titel' },
          newRow: { content: newContent, title: 'Titel' },
        }),
      ).toEqual([formattedContentRow]);
    },
  );

  it('keeps the sibling text row of a vae_node content change', () => {
    expect(
      getAuditLogDiffRows({
        entityType: 'vae_node',
        oldRow: { content: formattedContent, text: 'Fett' },
        newRow: { content: changedFormattedContent, text: 'Neu' },
      }),
    ).toEqual([
      formattedContentRow,
      expect.objectContaining({
        path: 'text',
        oldValue: 'Fett',
        newValue: 'Neu',
      }),
    ]);
  });

  it('keeps the values of a string content change of another entity', () => {
    expect(
      getAuditLogDiffRows({
        entityType: 'comment',
        oldRow: { content: 'Alter Kommentar' },
        newRow: { content: 'Neuer Kommentar' },
      }),
    ).toEqual([
      expect.objectContaining({
        path: 'content',
        oldValue: 'Alter Kommentar',
        newValue: 'Neuer Kommentar',
      }),
    ]);
  });
});
