import { beforeEach, describe, expect, it, vi } from 'vitest';
import { confirmDocumentType, setDocumentType } from './documentActions';

const mocks = vi.hoisted(() => ({
  state: new Map<string, Record<string, unknown>>(),
  insert: vi.fn(),
  update: vi.fn(),
}));

vi.mock('../collections/documentAssignments.collection', () => ({
  documentAssignmentsCollection: {
    state: mocks.state,
    insert: (...args: unknown[]) => mocks.insert(...args),
    update: (...args: unknown[]) => mocks.update(...args),
  },
}));

type AssignmentDraft = {
  humanRequiredDocumentTypeId: string | null;
  documentTypeId: string | null;
};

const applyUpdater = (call: unknown[]): AssignmentDraft => {
  const updater = call[1] as (draft: AssignmentDraft) => void;
  const draft: AssignmentDraft = {
    humanRequiredDocumentTypeId: null,
    documentTypeId: null,
  };
  updater(draft);

  return draft;
};

describe('documentActions', () => {
  beforeEach(() => {
    mocks.state.clear();
    mocks.insert.mockReset();
    mocks.update.mockReset();
  });

  describe('setDocumentType', () => {
    it('inserts one assignment row carrying the chosen type when none is loaded (H6: no crash, one write)', () => {
      setDocumentType('project-1', 'file-1', 'type-1');

      expect(mocks.insert).toHaveBeenCalledTimes(1);
      expect(mocks.insert).toHaveBeenCalledWith({
        projectId: 'project-1',
        documentId: 'file-1',
        aiSuggestedDocumentTypeId: null,
        humanRequiredDocumentTypeId: 'type-1',
        documentTypeId: 'type-1',
        documentTypeName: null,
        isResolved: false,
      });
      expect(mocks.update).not.toHaveBeenCalled();
    });

    it('updates the existing assignment row instead of inserting a duplicate', () => {
      mocks.state.set('file-1', { documentId: 'file-1' });

      setDocumentType('project-1', 'file-1', 'type-1');

      expect(mocks.insert).not.toHaveBeenCalled();
      expect(mocks.update).toHaveBeenCalledTimes(1);
      const updateCall = mocks.update.mock.calls[0];
      expect(updateCall?.[0]).toBe('file-1');
      expect(applyUpdater(updateCall ?? [])).toEqual({
        humanRequiredDocumentTypeId: 'type-1',
        documentTypeId: 'type-1',
      });
    });
  });

  describe('confirmDocumentType', () => {
    it('confirms the AI suggestion on the existing row through a single update', () => {
      mocks.state.set('file-1', {
        aiSuggestedDocumentTypeId: 'ai-type',
        documentTypeId: 'ai-type',
      });

      confirmDocumentType('project-1', 'file-1');

      expect(mocks.insert).not.toHaveBeenCalled();
      expect(mocks.update).toHaveBeenCalledTimes(1);
      expect(applyUpdater(mocks.update.mock.calls[0] ?? [])).toEqual({
        humanRequiredDocumentTypeId: 'ai-type',
        documentTypeId: 'ai-type',
      });
    });
  });
});
