import type { RowNode } from '@/features/project/data/document-tree/documentTreeTable';
import { describe, expect, it } from 'vitest';
import { collectFolderIds, sameFolderIdSet } from './readOnlyTree.utils';

const makeDocument = (id: string, filename: string): RowNode => ({
  kind: 'document',
  id,
  filename,
  createdAt: '2026-01-01T00:00:00Z',
  status: 'Zugeordnet',
  isDeleted: false,
});

const makeFolder = (
  id: string,
  title: string,
  children: RowNode[],
): RowNode => ({
  kind: 'folder',
  id,
  path: title,
  title,
  children,
});

describe('collectFolderIds', () => {
  it('collects every folder id depth-first', () => {
    const tree: RowNode[] = [
      makeFolder('f-1', 'A', [
        makeFolder('f-1-1', 'A.1', [makeDocument('d', 'x.pdf')]),
      ]),
      makeFolder('f-2', 'B', []),
    ];

    expect(collectFolderIds(tree)).toEqual({
      'f-1': true,
      'f-1-1': true,
      'f-2': true,
    });
  });
});

describe('sameFolderIdSet', () => {
  it('returns true when both sets have the same keys', () => {
    expect(sameFolderIdSet({ a: true, b: true }, { a: true, b: true })).toBe(
      true,
    );
  });

  it('returns false when keys differ', () => {
    expect(sameFolderIdSet({ a: true }, { a: true, b: true })).toBe(false);
    expect(sameFolderIdSet({ a: true, b: true }, { a: true })).toBe(false);
  });

  it('returns false when previous expansion is `true` (all expanded)', () => {
    expect(sameFolderIdSet(true, { a: true })).toBe(false);
  });
});
