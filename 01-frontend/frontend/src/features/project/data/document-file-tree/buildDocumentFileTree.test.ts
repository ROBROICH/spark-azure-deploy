import { describe, expect, it } from 'vitest';
import {
  buildDocumentFileTree,
  isDocumentFileTreeFolder,
} from './buildDocumentFileTree';

const documents = [
  { id: 'file-1', filename: 'Unterlagen/foo.pdf' },
  { id: 'file-2', filename: 'Unterlagen/bar.pdf' },
];

describe('buildDocumentFileTree', () => {
  it('collapses a common root even when it matches the localized root label', () => {
    const tree = buildDocumentFileTree(documents, {
      rootLabel: 'Unterlagen',
    });

    expect(tree.name).toBe('Unterlagen');
    expect(
      tree.children.every((child) => !isDocumentFileTreeFolder(child)),
    ).toBe(true);
    expect(tree.children.map((child) => child.id)).toEqual([
      'file-2',
      'file-1',
    ]);
  });
});
