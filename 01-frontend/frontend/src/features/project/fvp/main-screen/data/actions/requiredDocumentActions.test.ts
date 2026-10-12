import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setRequiredDocumentsStructure } from './requiredDocumentActions';
import type { RequiredDocumentNode } from '../schemas/requiredDocument.schema';

type Txn = { isPersisted: { promise: Promise<unknown> } };

const makeTxn = (): Txn => ({ isPersisted: { promise: Promise.resolve() } });

const requiredDocs = vi.hoisted(() => ({
  state: new Map<string, Record<string, unknown>>(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}));

vi.mock('../collections/requiredDocuments.collection', () => ({
  requiredDocumentsCollection: {
    state: requiredDocs.state,
    insert: (...args: unknown[]) => requiredDocs.insert(...args),
    update: (...args: unknown[]) => requiredDocs.update(...args),
    delete: (...args: unknown[]) => requiredDocs.delete(...args),
  },
}));

const PROJECT_ID = 'project-1';
const CUSTOM_CATEGORY_ID = 'cat-custom';

/** Seeds the custom category row so the structure can be synchronized. */
const seedCustomCategory = () => {
  requiredDocs.state.set(CUSTOM_CATEGORY_ID, {
    projectId: PROJECT_ID,
    id: CUSTOM_CATEGORY_ID,
    name: 'Benutzerdefiniert',
    parentId: null,
    isCategory: true,
    origin: 'custom',
    isResolved: false,
  });
};

/** Builds the custom category node carrying the desired leaf children. */
const buildStructure = (
  children: { id: string; name: string }[],
): RequiredDocumentNode[] => [
  {
    id: CUSTOM_CATEGORY_ID,
    name: 'Benutzerdefiniert',
    children,
  },
];

describe('setRequiredDocumentsStructure', () => {
  beforeEach(() => {
    requiredDocs.state.clear();
    requiredDocs.insert.mockReset().mockImplementation(makeTxn);
    requiredDocs.update.mockReset().mockImplementation(makeTxn);
    requiredDocs.delete.mockReset().mockImplementation(makeTxn);
  });

  it('skips a freshly added custom row whose name is only whitespace', () => {
    seedCustomCategory();

    const transactions = setRequiredDocumentsStructure(
      PROJECT_ID,
      buildStructure([{ id: 'doc-blank', name: '   ' }]),
    );

    // A blank/whitespace-only name trims to '' and must not be inserted,
    // otherwise the dialog would persist an empty custom required-document type.
    expect(requiredDocs.insert).not.toHaveBeenCalled();
    expect(requiredDocs.update).not.toHaveBeenCalled();
    expect(requiredDocs.delete).not.toHaveBeenCalled();
    expect(transactions).toHaveLength(0);
  });

  it('parents inserts under the seeded category id even when the structure node id differs', () => {
    seedCustomCategory();

    setRequiredDocumentsStructure(PROJECT_ID, [
      {
        // Structure node uses a different id than the seeded category row, but
        // resolves to the same custom category by normalized label.
        id: 'cat-from-editor',
        name: 'Benutzerdefiniert',
        children: [{ id: 'doc-new', name: 'New Type' }],
      },
    ]);

    const inserted = requiredDocs.insert.mock.calls[0]?.[0] as {
      parentId: string;
    };
    // parentId must be the persisted category id, not the editor's structure id.
    expect(inserted.parentId).toBe(CUSTOM_CATEGORY_ID);
  });

  it('does not delete a same-id custom row that belongs to another project', () => {
    seedCustomCategory();
    // Same custom-doc id seeded under a different project; syncing project-1
    // must not delete another project's row.
    requiredDocs.state.set('doc-shared', {
      projectId: 'project-2',
      id: 'doc-shared',
      name: 'Foreign',
      parentId: CUSTOM_CATEGORY_ID,
      isCategory: false,
      origin: 'custom',
      isResolved: false,
    });

    setRequiredDocumentsStructure(PROJECT_ID, buildStructure([]));

    expect(requiredDocs.delete).not.toHaveBeenCalled();
  });
});
