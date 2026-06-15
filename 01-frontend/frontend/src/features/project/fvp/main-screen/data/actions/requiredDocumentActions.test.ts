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

const assignments = vi.hoisted(() => ({
  state: new Map<string, Record<string, unknown>>(),
  update: vi.fn(),
}));

vi.mock('../collections/requiredDocuments.collection', () => ({
  requiredDocumentsCollection: {
    state: requiredDocs.state,
    insert: (...args: unknown[]) => requiredDocs.insert(...args),
    update: (...args: unknown[]) => requiredDocs.update(...args),
    delete: (...args: unknown[]) => requiredDocs.delete(...args),
  },
}));

vi.mock('../collections/documentAssignments.collection', () => ({
  documentAssignmentsCollection: {
    state: assignments.state,
    update: (...args: unknown[]) => assignments.update(...args),
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

/** Seeds an existing custom document row under the custom category. */
const seedCustomDoc = (id: string, name: string) => {
  requiredDocs.state.set(id, {
    projectId: PROJECT_ID,
    id,
    name,
    parentId: CUSTOM_CATEGORY_ID,
    isCategory: false,
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

type RequiredDocDraft = { name: string };

const applyRequiredDocUpdater = (call: unknown[]): RequiredDocDraft => {
  const updater = call[1] as (draft: RequiredDocDraft) => void;
  const draft: RequiredDocDraft = { name: '' };
  updater(draft);

  return draft;
};

type AssignmentDraft = {
  humanRequiredDocumentTypeId: string | null;
  documentTypeId: string | null;
  documentTypeName: string | null;
};

const applyAssignmentUpdater = (call: unknown[]): AssignmentDraft => {
  const updater = call[1] as (draft: AssignmentDraft) => void;
  const draft: AssignmentDraft = {
    humanRequiredDocumentTypeId: 'leftover',
    documentTypeId: 'leftover',
    documentTypeName: 'leftover',
  };
  updater(draft);

  return draft;
};

describe('setRequiredDocumentsStructure', () => {
  beforeEach(() => {
    requiredDocs.state.clear();
    assignments.state.clear();
    requiredDocs.insert.mockReset().mockImplementation(makeTxn);
    requiredDocs.update.mockReset().mockImplementation(makeTxn);
    requiredDocs.delete.mockReset().mockImplementation(makeTxn);
    assignments.update.mockReset().mockImplementation(makeTxn);
  });

  it('inserts a brand-new custom row with the right payload (one non-optimistic write)', () => {
    seedCustomCategory();

    const transactions = setRequiredDocumentsStructure(
      PROJECT_ID,
      buildStructure([{ id: 'doc-new', name: '  New Type  ' }]),
    );

    expect(requiredDocs.insert).toHaveBeenCalledTimes(1);
    expect(requiredDocs.insert).toHaveBeenCalledWith(
      {
        projectId: PROJECT_ID,
        id: 'doc-new',
        name: 'New Type',
        parentId: CUSTOM_CATEGORY_ID,
        isCategory: false,
        origin: 'custom',
        isResolved: false,
      },
      { optimistic: false },
    );
    expect(requiredDocs.update).not.toHaveBeenCalled();
    expect(requiredDocs.delete).not.toHaveBeenCalled();
    expect(transactions).toHaveLength(1);
  });

  it('updates an existing custom row when only its name changed', () => {
    seedCustomCategory();
    seedCustomDoc('doc-1', 'Old Name');

    const transactions = setRequiredDocumentsStructure(
      PROJECT_ID,
      buildStructure([{ id: 'doc-1', name: 'New Name' }]),
    );

    expect(requiredDocs.insert).not.toHaveBeenCalled();
    expect(requiredDocs.delete).not.toHaveBeenCalled();
    expect(requiredDocs.update).toHaveBeenCalledTimes(1);
    const requiredDocUpdateCall = requiredDocs.update.mock.calls[0];
    expect(requiredDocUpdateCall?.[0]).toBe('doc-1');
    expect(applyRequiredDocUpdater(requiredDocUpdateCall ?? [])).toEqual({
      name: 'New Name',
    });
    expect(transactions).toHaveLength(1);
  });

  it('does not write when an existing custom row is unchanged', () => {
    seedCustomCategory();
    seedCustomDoc('doc-1', 'Same Name');

    const transactions = setRequiredDocumentsStructure(
      PROJECT_ID,
      buildStructure([{ id: 'doc-1', name: 'Same Name' }]),
    );

    expect(requiredDocs.insert).not.toHaveBeenCalled();
    expect(requiredDocs.update).not.toHaveBeenCalled();
    expect(requiredDocs.delete).not.toHaveBeenCalled();
    expect(transactions).toHaveLength(0);
  });

  it('deletes a removed custom row and clears its orphaned assignment', () => {
    seedCustomCategory();
    seedCustomDoc('doc-keep', 'Keep');
    seedCustomDoc('doc-remove', 'Remove');
    assignments.state.set('file-1', {
      projectId: PROJECT_ID,
      documentId: 'file-1',
      documentTypeId: 'doc-remove',
    });

    const transactions = setRequiredDocumentsStructure(
      PROJECT_ID,
      buildStructure([{ id: 'doc-keep', name: 'Keep' }]),
    );

    expect(requiredDocs.delete).toHaveBeenCalledTimes(1);
    expect(requiredDocs.delete).toHaveBeenCalledWith('doc-remove');

    expect(assignments.update).toHaveBeenCalledTimes(1);
    const assignmentUpdateCall = assignments.update.mock.calls[0];
    expect(assignmentUpdateCall?.[0]).toBe('file-1');
    expect(applyAssignmentUpdater(assignmentUpdateCall ?? [])).toEqual({
      humanRequiredDocumentTypeId: null,
      documentTypeId: null,
      documentTypeName: null,
    });

    // One delete transaction plus one cleared-assignment transaction, so the
    // dialog can await every write and fail closed.
    expect(transactions).toHaveLength(2);
  });

  it('does not touch assignments pointing at a removed custom row in another project', () => {
    seedCustomCategory();
    seedCustomDoc('doc-remove', 'Remove');
    assignments.state.set('file-other', {
      projectId: 'project-2',
      documentId: 'file-other',
      documentTypeId: 'doc-remove',
    });

    const transactions = setRequiredDocumentsStructure(
      PROJECT_ID,
      buildStructure([]),
    );

    expect(requiredDocs.delete).toHaveBeenCalledTimes(1);
    expect(assignments.update).not.toHaveBeenCalled();
    expect(transactions).toHaveLength(1);
  });

  it('returns one transaction per write so callers can await persistence and fail closed', () => {
    seedCustomCategory();
    seedCustomDoc('doc-rename', 'Old');
    seedCustomDoc('doc-remove', 'Remove');
    assignments.state.set('file-1', {
      projectId: PROJECT_ID,
      documentId: 'file-1',
      documentTypeId: 'doc-remove',
    });

    const transactions = setRequiredDocumentsStructure(
      PROJECT_ID,
      buildStructure([
        { id: 'doc-rename', name: 'New' },
        { id: 'doc-new', name: 'Fresh' },
      ]),
    );

    // insert + update + delete + cleared assignment = 4 writes.
    expect(requiredDocs.insert).toHaveBeenCalledTimes(1);
    expect(requiredDocs.update).toHaveBeenCalledTimes(1);
    expect(requiredDocs.delete).toHaveBeenCalledTimes(1);
    expect(assignments.update).toHaveBeenCalledTimes(1);
    expect(transactions).toHaveLength(4);
    for (const transaction of transactions) {
      expect(transaction.isPersisted.promise).toBeInstanceOf(Promise);
    }
  });

  it('returns no transactions when the project has no custom category at all', () => {
    const transactions = setRequiredDocumentsStructure(PROJECT_ID, []);

    expect(requiredDocs.insert).not.toHaveBeenCalled();
    expect(requiredDocs.update).not.toHaveBeenCalled();
    expect(requiredDocs.delete).not.toHaveBeenCalled();
    expect(assignments.update).not.toHaveBeenCalled();
    expect(transactions).toHaveLength(0);
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

  it('treats an existing custom row blanked to whitespace as a removal and clears its assignment', () => {
    seedCustomCategory();
    seedCustomDoc('doc-blank', 'Was Named');
    assignments.state.set('file-1', {
      projectId: PROJECT_ID,
      documentId: 'file-1',
      documentTypeId: 'doc-blank',
    });

    const transactions = setRequiredDocumentsStructure(
      PROJECT_ID,
      buildStructure([{ id: 'doc-blank', name: '   ' }]),
    );

    // The blanked entry is filtered out of nextCustomDocs, so the still-present
    // current id is treated as removed: delete the row and clear its assignment.
    expect(requiredDocs.insert).not.toHaveBeenCalled();
    expect(requiredDocs.update).not.toHaveBeenCalled();
    expect(requiredDocs.delete).toHaveBeenCalledTimes(1);
    expect(requiredDocs.delete).toHaveBeenCalledWith('doc-blank');

    expect(assignments.update).toHaveBeenCalledTimes(1);
    const assignmentUpdateCall = assignments.update.mock.calls[0];
    expect(assignmentUpdateCall?.[0]).toBe('file-1');
    expect(applyAssignmentUpdater(assignmentUpdateCall ?? [])).toEqual({
      humanRequiredDocumentTypeId: null,
      documentTypeId: null,
      documentTypeName: null,
    });
    expect(transactions).toHaveLength(2);
  });

  it('trims the name before comparing, so a whitespace-only edit is a no-op', () => {
    seedCustomCategory();
    seedCustomDoc('doc-1', 'Same Name');

    const transactions = setRequiredDocumentsStructure(
      PROJECT_ID,
      buildStructure([{ id: 'doc-1', name: '  Same Name  ' }]),
    );

    // After trimming, the name is unchanged, so no update should be issued.
    expect(requiredDocs.insert).not.toHaveBeenCalled();
    expect(requiredDocs.update).not.toHaveBeenCalled();
    expect(requiredDocs.delete).not.toHaveBeenCalled();
    expect(transactions).toHaveLength(0);
  });

  it('parents inserts under the seeded category id even when the structure node id differs', () => {
    seedCustomCategory();

    const transactions = setRequiredDocumentsStructure(PROJECT_ID, [
      {
        // Structure node uses a different id than the seeded category row, but
        // resolves to the same custom category by normalized label.
        id: 'cat-from-editor',
        name: 'Benutzerdefiniert',
        children: [{ id: 'doc-new', name: 'New Type' }],
      },
    ]);

    expect(requiredDocs.insert).toHaveBeenCalledTimes(1);
    const inserted = requiredDocs.insert.mock.calls[0]?.[0] as {
      parentId: string;
    };
    // parentId must be the persisted category id, not the editor's structure id.
    expect(inserted.parentId).toBe(CUSTOM_CATEGORY_ID);
    expect(transactions).toHaveLength(1);
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

    const transactions = setRequiredDocumentsStructure(
      PROJECT_ID,
      buildStructure([]),
    );

    expect(requiredDocs.delete).not.toHaveBeenCalled();
    expect(assignments.update).not.toHaveBeenCalled();
    expect(transactions).toHaveLength(0);
  });
});
