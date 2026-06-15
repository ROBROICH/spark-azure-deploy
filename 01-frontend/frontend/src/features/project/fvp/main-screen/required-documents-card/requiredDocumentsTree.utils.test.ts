import { describe, expect, it } from 'vitest';
import type { RequiredDocumentNode } from '../data/schemas/requiredDocument.schema';
import {
  addDocumentToCustomCategory,
  getCustomCategoryId,
  hasDuplicateCustomDocumentName,
  removeDocumentFromTree,
  updateDocumentNameInTree,
} from './requiredDocumentsTree.utils';

const structure: RequiredDocumentNode[] = [
  {
    id: 'system-category',
    name: 'System',
    children: [
      {
        id: 'system-doc',
        name: 'Lageplan',
      },
    ],
  },
  {
    id: 'custom-category',
    name: 'Benutzerdefiniert',
    children: [
      {
        id: 'custom-doc-1',
        name: 'Projektbeschreibung',
      },
      {
        id: 'custom-doc-2',
        name: 'Prüfbericht',
      },
    ],
  },
];

describe('required documents custom document validation', () => {
  it('detects duplicate custom document names after trimming and case normalization', () => {
    expect(
      hasDuplicateCustomDocumentName(structure, '  projektbeschreibung  '),
    ).toBe(true);
    expect(hasDuplicateCustomDocumentName(structure, 'PRÜFBERICHT')).toBe(true);
  });

  it('ignores the currently edited custom document when checking duplicate names', () => {
    expect(
      hasDuplicateCustomDocumentName(
        structure,
        'Projektbeschreibung',
        'custom-doc-1',
      ),
    ).toBe(false);
  });

  it('does not treat system document names as custom duplicates', () => {
    expect(hasDuplicateCustomDocumentName(structure, 'Lageplan')).toBe(false);
  });

  it('detects duplicates against other custom documents while editing', () => {
    expect(
      hasDuplicateCustomDocumentName(
        structure,
        'Projektbeschreibung',
        'custom-doc-2',
      ),
    ).toBe(true);
  });
});

describe('updateDocumentNameInTree', () => {
  it('renames a nested leaf document while preserving the rest of the tree', () => {
    const result = updateDocumentNameInTree(
      structure,
      'custom-doc-1',
      'Aktualisierte Projektbeschreibung',
    );

    expect(result).toEqual([
      {
        id: 'system-category',
        name: 'System',
        children: [
          {
            id: 'system-doc',
            name: 'Lageplan',
          },
        ],
      },
      {
        id: 'custom-category',
        name: 'Benutzerdefiniert',
        children: [
          {
            id: 'custom-doc-1',
            name: 'Aktualisierte Projektbeschreibung',
          },
          {
            id: 'custom-doc-2',
            name: 'Prüfbericht',
          },
        ],
      },
    ]);
  });

  it('renames a category node by id without touching its children', () => {
    const result = updateDocumentNameInTree(
      structure,
      'system-category',
      'Behörde',
    );

    expect(result[0]).toEqual({
      id: 'system-category',
      name: 'Behörde',
      children: [
        {
          id: 'system-doc',
          name: 'Lageplan',
        },
      ],
    });
    // Sibling category is structurally untouched.
    expect(result[1]).toEqual(structure[1]);
  });

  it('only changes the matched leaf and keeps every sibling value intact', () => {
    const result = updateDocumentNameInTree(
      structure,
      'custom-doc-2',
      'Geänderter Prüfbericht',
    );

    // The system branch contains no match, so it is returned untouched.
    expect(result[0]).toEqual(structure[0]);
    const customCategory = result[1];
    expect(customCategory?.children?.[1]?.name).toBe('Geänderter Prüfbericht');
    // The non-matching sibling leaf keeps its identity and value.
    expect(customCategory?.children?.[0]).toBe(structure[1]?.children?.[0]);
  });

  it('returns an unchanged tree when no node matches the id', () => {
    const result = updateDocumentNameInTree(structure, 'missing-id', 'Ignored');

    expect(result).toEqual(structure);
  });
});

describe('removeDocumentFromTree', () => {
  it('removes a nested leaf and preserves its surviving sibling and ordering', () => {
    const result = removeDocumentFromTree(structure, 'custom-doc-1');

    expect(result).toEqual([
      {
        id: 'system-category',
        name: 'System',
        children: [
          {
            id: 'system-doc',
            name: 'Lageplan',
          },
        ],
      },
      {
        id: 'custom-category',
        name: 'Benutzerdefiniert',
        children: [
          {
            id: 'custom-doc-2',
            name: 'Prüfbericht',
          },
        ],
      },
    ]);
  });

  it('removes a top-level category together with all its descendants', () => {
    const result = removeDocumentFromTree(structure, 'custom-category');

    expect(result).toEqual([
      {
        id: 'system-category',
        name: 'System',
        children: [
          {
            id: 'system-doc',
            name: 'Lageplan',
          },
        ],
      },
    ]);
  });

  it('leaves an empty children array when the last child is removed', () => {
    const result = removeDocumentFromTree(structure, 'system-doc');

    expect(result[0]).toEqual({
      id: 'system-category',
      name: 'System',
      children: [],
    });
    expect(result[1]).toEqual(structure[1]);
  });

  it('returns an unchanged tree when no node matches the id', () => {
    const result = removeDocumentFromTree(structure, 'missing-id');

    expect(result).toEqual(structure);
  });
});

describe('addDocumentToCustomCategory', () => {
  const newDocument: RequiredDocumentNode = {
    id: 'custom-doc-new',
    name: 'Statik',
  };

  it('appends the new document to an existing custom category as the last child', () => {
    const customCategoryId = getCustomCategoryId(structure);

    const result = addDocumentToCustomCategory(
      structure,
      newDocument,
      customCategoryId,
    );

    expect(result).toEqual([
      {
        id: 'system-category',
        name: 'System',
        children: [
          {
            id: 'system-doc',
            name: 'Lageplan',
          },
        ],
      },
      {
        id: 'custom-category',
        name: 'Benutzerdefiniert',
        children: [
          {
            id: 'custom-doc-1',
            name: 'Projektbeschreibung',
          },
          {
            id: 'custom-doc-2',
            name: 'Prüfbericht',
          },
          {
            id: 'custom-doc-new',
            name: 'Statik',
          },
        ],
      },
    ]);
  });

  it('creates a custom category with the provided id when none exists yet', () => {
    const systemOnly: RequiredDocumentNode[] = [
      {
        id: 'system-category',
        name: 'System',
        children: [
          {
            id: 'system-doc',
            name: 'Lageplan',
          },
        ],
      },
    ];

    const result = addDocumentToCustomCategory(
      systemOnly,
      newDocument,
      'provided-custom-id',
    );

    expect(result).toEqual([
      {
        id: 'system-category',
        name: 'System',
        children: [
          {
            id: 'system-doc',
            name: 'Lageplan',
          },
        ],
      },
      {
        id: 'provided-custom-id',
        name: 'Benutzerdefiniert',
        children: [
          {
            id: 'custom-doc-new',
            name: 'Statik',
          },
        ],
      },
    ]);
  });

  it('generates a custom category id when none exists and none is provided', () => {
    const systemOnly: RequiredDocumentNode[] = [
      {
        id: 'system-category',
        name: 'System',
        children: [],
      },
    ];

    const result = addDocumentToCustomCategory(systemOnly, newDocument, null);

    expect(result).toHaveLength(2);

    const createdCategory = result[1];
    expect(createdCategory?.name).toBe('Benutzerdefiniert');
    expect(typeof createdCategory?.id).toBe('string');
    expect(createdCategory?.id.length).toBeGreaterThan(0);
    expect(createdCategory?.children).toEqual([
      {
        id: 'custom-doc-new',
        name: 'Statik',
      },
    ]);
  });
});
