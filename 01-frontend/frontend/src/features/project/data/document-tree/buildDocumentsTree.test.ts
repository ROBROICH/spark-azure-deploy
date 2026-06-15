import { describe, expect, it } from 'vitest';
import { buildDocumentsTree } from './buildDocumentsTree';

const makeFile = (id: string, path: string) => ({
  id,
  path,
  linkedDocumentTypeId: null,
  linkedDocumentTypeHumanApproved: false,
});

describe('buildDocumentsTree', () => {
  it('uses uploaded document paths without adding synthetic root folders', () => {
    const tree = buildDocumentsTree(
      [
        makeFile('file-1', '01 Antrag/Antrag.pdf'),
        makeFile('file-2', '02 Planunterlagen/Lageplan.pdf'),
      ],
      [],
    );

    expect(
      tree.map((node) => (node.kind === 'folder' ? node.title : '')),
    ).toEqual(['01 Antrag', '02 Planunterlagen']);
  });

  it('keeps documents at the ZIP root visible as top-level rows', () => {
    const tree = buildDocumentsTree(
      [
        makeFile('file-1', 'Antrag.pdf'),
        makeFile('file-2', 'Planunterlagen/Lageplan.pdf'),
      ],
      [],
    );

    expect(tree).toHaveLength(2);
    expect(tree[0]).toMatchObject({
      kind: 'folder',
      title: 'Planunterlagen',
    });
    expect(tree[1]).toMatchObject({
      kind: 'document',
      filename: 'Antrag.pdf',
    });
  });
});
