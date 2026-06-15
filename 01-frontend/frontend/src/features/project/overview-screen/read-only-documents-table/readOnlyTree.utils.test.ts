import type { RowNode } from '@/features/project/data/document-tree/documentTreeTable';
import { describe, expect, it } from 'vitest';
import {
  collectFolderIds,
  filterNodesBySearch,
  sameFolderIdSet,
} from './readOnlyTree.utils';

const makeDocument = (id: string, filename: string): RowNode => ({
  kind: 'document',
  id,
  filename,
  createdAt: '2026-01-01T00:00:00Z',
  status: 'Zugeordnet',
  isDeleted: false,
});

const makeTypedDocument = (
  id: string,
  filename: string,
  linkedDocumentTypeName: string,
): RowNode => ({
  kind: 'document',
  id,
  filename,
  createdAt: '2026-01-01T00:00:00Z',
  status: 'Zugeordnet',
  isDeleted: false,
  linkedDocumentType: {
    id: `${id}-type`,
    humanApproved: false,
    name: linkedDocumentTypeName,
  },
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

describe('filterNodesBySearch', () => {
  it('keeps a folder and its original children when the folder title matches but no child does', () => {
    const tree: RowNode[] = [
      makeFolder('f-1', 'Planunterlagen', [
        makeDocument('d-1', 'site-plan.pdf'),
        makeDocument('d-2', 'roof-details.pdf'),
      ]),
    ];

    const filtered = filterNodesBySearch(tree, 'Planunterlagen');

    expect(filtered).toHaveLength(1);
    const folder = filtered[0];
    expect(folder?.kind).toBe('folder');
    if (folder?.kind === 'folder') {
      expect(folder.children.map((child) => child.id)).toEqual(['d-1', 'd-2']);
    }
  });

  it('returns the original tree when search is empty', () => {
    const tree: RowNode[] = [
      makeFolder('f-1', 'Planunterlagen', [makeDocument('d-1', 'a.pdf')]),
    ];
    expect(filterNodesBySearch(tree, '')).toBe(tree);
  });

  it('keeps only matching documents when a child matches', () => {
    const tree: RowNode[] = [
      makeFolder('f-1', 'Planunterlagen', [
        makeDocument('d-1', 'site-plan.pdf'),
        makeDocument('d-2', 'roof-details.pdf'),
      ]),
    ];

    const filtered = filterNodesBySearch(tree, 'roof');
    expect(filtered).toHaveLength(1);
    const folder = filtered[0];
    if (folder?.kind === 'folder') {
      expect(folder.children.map((child) => child.id)).toEqual(['d-2']);
    }
  });

  it('matches linked document type names when the filename does not match', () => {
    const tree: RowNode[] = [
      makeFolder('f-1', 'Planunterlagen', [
        makeTypedDocument('d-1', 'site-plan.pdf', 'Brandschutzkonzept'),
        makeTypedDocument('d-2', 'roof-details.pdf', 'Dachplan'),
      ]),
    ];

    const filtered = filterNodesBySearch(tree, 'Brandschutz');
    expect(filtered).toHaveLength(1);
    const folder = filtered[0];
    if (folder?.kind === 'folder') {
      expect(folder.children.map((child) => child.id)).toEqual(['d-1']);
    }
  });

  it('drops folders that neither match nor contain matches', () => {
    const tree: RowNode[] = [
      makeFolder('f-1', 'Other', [makeDocument('d-1', 'unrelated.pdf')]),
    ];

    expect(filterNodesBySearch(tree, 'roof')).toEqual([]);
  });
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
