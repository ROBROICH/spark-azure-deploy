import type { FileDiffResponse } from '@/api-clients/backend';
import { describe, expect, it } from 'vitest';
import {
  buildDefaultSelectedKeys,
  buildDiffRows,
  buildDiffTree,
  buildTrimmedDiff,
} from './documentDiff.utils';

const sampleDiff: FileDiffResponse = {
  new: [{ filename: 'plan-c.pdf', bucketPath: 'bucket/c', sha: 'sha-c' }],
  changed: [
    {
      fileId: 'file-1',
      filename: 'plan-a.pdf',
      bucketPath: 'bucket/a',
      sourceSha: 'sha-a-uploaded',
      targetSha: 'sha-a-existing',
    },
  ],
  renamed: [
    {
      fileId: 'file-2',
      oldName: 'plan-b-old.pdf',
      newName: 'plan-b.pdf',
      sha: 'sha-b',
      bucketPath: 'bucket/b',
    },
  ],
  deleted: [{ fileId: 'file-3', filename: 'plan-d.pdf', sha: 'sha-d' }],
  unchanged: [{ fileId: 'file-4', filename: 'plan-e.pdf', sha: 'sha-e' }],
};

describe('documentDiff.utils', () => {
  it('keeps the full diff when every selectable row stays selected', () => {
    const rows = buildDiffRows(sampleDiff);
    const selected = buildDefaultSelectedKeys(rows);
    const trimmed = buildTrimmedDiff(sampleDiff, selected);

    expect(trimmed.new).toHaveLength(1);
    expect(trimmed.changed).toHaveLength(1);
    expect(trimmed.renamed).toHaveLength(1);
    expect(trimmed.deleted).toHaveLength(1);
    expect(trimmed.unchanged).toHaveLength(1);
  });

  it('always keeps new files in the trimmed diff because the backend must decide every entry', () => {
    const trimmed = buildTrimmedDiff(sampleDiff, new Set<string>());

    expect(trimmed.new).toEqual(sampleDiff.new);
    expect(trimmed.unchanged).toHaveLength(4);
  });

  it('demotes a deselected replaced file to unchanged using the existing file sha', () => {
    const rows = buildDiffRows(sampleDiff);
    const selected = buildDefaultSelectedKeys(rows);
    selected.delete('changed:file-1');

    const trimmed = buildTrimmedDiff(sampleDiff, selected);

    expect(trimmed.changed).toHaveLength(0);
    expect(trimmed.unchanged).toContainEqual({
      fileId: 'file-1',
      filename: 'plan-a.pdf',
      sha: 'sha-a-existing',
    });
  });

  it('demotes a deselected renamed file to unchanged using the old name', () => {
    const rows = buildDiffRows(sampleDiff);
    const selected = buildDefaultSelectedKeys(rows);
    selected.delete('renamed:file-2');

    const trimmed = buildTrimmedDiff(sampleDiff, selected);

    expect(trimmed.renamed).toHaveLength(0);
    expect(trimmed.unchanged).toContainEqual({
      fileId: 'file-2',
      filename: 'plan-b-old.pdf',
      sha: 'sha-b',
    });
  });

  it('marks unchanged and new rows as non-selectable and deleted rows as selectable', () => {
    const rows = buildDiffRows(sampleDiff);
    const unchangedRow = rows.find((row) => row.changeType === 'unchanged');
    const newRow = rows.find((row) => row.changeType === 'new');
    const deletedRow = rows.find((row) => row.changeType === 'deleted');

    expect(unchangedRow?.selectable).toBe(false);
    expect(newRow?.selectable).toBe(false);
    expect(deletedRow?.selectable).toBe(true);
  });

  it('demotes a deselected deleted file to unchanged', () => {
    const rows = buildDiffRows(sampleDiff);
    const selected = buildDefaultSelectedKeys(rows);
    selected.delete('deleted:file-3');

    const trimmed = buildTrimmedDiff(sampleDiff, selected);

    expect(trimmed.deleted).toHaveLength(0);
    expect(trimmed.unchanged).toContainEqual({
      fileId: 'file-3',
      filename: 'plan-d.pdf',
      sha: 'sha-d',
    });
  });

  it('builds nested diff folders with document counts and sorted siblings', () => {
    const tree = buildDiffTree([
      {
        key: 'new:b',
        oldFilename: null,
        newFilename: 'B/beta.pdf',
        changeType: 'new',
        selectable: true,
      },
      {
        key: 'new:a-deep',
        oldFilename: null,
        newFilename: 'A/Nested/deep.pdf',
        changeType: 'new',
        selectable: true,
      },
      {
        key: 'new:a-root',
        oldFilename: null,
        newFilename: 'A/root.pdf',
        changeType: 'new',
        selectable: true,
      },
    ]);

    expect(
      tree.map((node) => (node.kind === 'folder' ? node.name : 'file')),
    ).toEqual(['A', 'B']);
    const folderA = tree[0];
    expect(folderA?.kind).toBe('folder');
    if (folderA?.kind === 'folder') {
      expect(folderA.documentCount).toBe(2);
      expect(
        folderA.children.map((node) =>
          node.kind === 'folder' ? node.name : node.row.newFilename,
        ),
      ).toEqual(['Nested', 'A/root.pdf']);
    }
  });
});
