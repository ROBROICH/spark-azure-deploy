import { beforeEach, describe, expect, it, vi } from 'vitest';
import { documentAssignmentsCollection } from './documentAssignments.collection';

type ParsedLoadSubsetOptions = {
  filters: { field: string[]; value: string }[];
};

const mocks = vi.hoisted(() => ({
  patchDocument: vi.fn(),
  getDocAssignments: vi.fn(),
  fetchQuery: vi.fn(),
  parseLoadSubsetOptions: vi.fn(
    (..._args: unknown[]): ParsedLoadSubsetOptions => ({ filters: [] }),
  ),
}));

vi.mock('@/api-clients/fcs-module', () => ({
  getDocAssignmentsProjectIdDocumentAssignmentsGet: (...args: unknown[]) =>
    mocks.getDocAssignments(...args),
  patchDocumentProjectIdDocumentsFileIdPatch: (...args: unknown[]) =>
    mocks.patchDocument(...args),
}));

vi.mock('@/api-clients/fcs-module/@tanstack/react-query.gen', () => ({
  getRequiredDocumentTypesProjectIdRequiredDocumentTypesGetOptions: vi.fn(),
}));

vi.mock('@/integrations/tanstack-query/root-provider', () => ({
  queryClient: {
    fetchQuery: (...args: unknown[]) => mocks.fetchQuery(...args),
    invalidateQueries: vi.fn(),
  },
}));

vi.mock('@tanstack/query-db-collection', () => ({
  parseLoadSubsetOptions: (...args: unknown[]) =>
    mocks.parseLoadSubsetOptions(...args),
  queryCollectionOptions: (options: object) => options,
}));

vi.mock('@tanstack/react-db', () => ({
  createCollection: (options: object) => ({ ...options, utils: {} }),
}));

type AssignmentTransaction = {
  transaction: { mutations: unknown[] };
};

type QueryFnContext = {
  meta?: { loadSubsetOptions?: Record<string, unknown> };
};

type AssignmentHandlers = {
  onInsert: (args: AssignmentTransaction) => Promise<Record<string, unknown>[]>;
  onUpdate: (args: AssignmentTransaction) => Promise<Record<string, unknown>[]>;
  queryFn: (ctx: QueryFnContext) => Promise<Record<string, unknown>[]>;
};

const handlers = documentAssignmentsCollection as unknown as AssignmentHandlers;

const baseAssignment = {
  projectId: 'project-1',
  documentId: 'file-1',
  aiSuggestedDocumentTypeId: 'ai-type',
  humanRequiredDocumentTypeId: null,
  documentTypeId: 'ai-type',
  documentTypeName: 'Lageplan',
  isResolved: false,
};

const updateMutation = {
  original: baseAssignment,
  changes: {
    humanRequiredDocumentTypeId: 'human-type',
    documentTypeId: 'human-type',
  },
  key: 'file-1',
};

const insertMutation = {
  modified: {
    ...baseAssignment,
    aiSuggestedDocumentTypeId: null,
    humanRequiredDocumentTypeId: 'human-type',
    documentTypeId: 'human-type',
    documentTypeName: null,
  },
};

describe('documentAssignmentsCollection persistence', () => {
  beforeEach(() => {
    mocks.patchDocument.mockReset();
  });

  describe('onUpdate', () => {
    it('reconciles local fields from the backend response on success', async () => {
      mocks.patchDocument.mockResolvedValue({
        data: {
          ai_suggested_required_document_type_id: 'ai-type',
          human_required_document_type_id: 'human-type',
        },
        error: undefined,
      });

      const result = await handlers.onUpdate({
        transaction: { mutations: [updateMutation] },
      });

      expect(mocks.patchDocument).toHaveBeenCalledWith({
        path: { project_id: 'project-1', file_id: 'file-1' },
        body: { human_required_document_type_id: 'human-type' },
      });
      expect(result[0]).toMatchObject({
        humanRequiredDocumentTypeId: 'human-type',
        documentTypeId: 'human-type',
      });
    });

    it('fails closed when the PATCH returns an error (H1)', async () => {
      mocks.patchDocument.mockResolvedValue({
        data: undefined,
        error: { detail: 'boom' },
      });

      await expect(
        handlers.onUpdate({ transaction: { mutations: [updateMutation] } }),
      ).rejects.toThrow('Failed to persist document assignment');
    });

    it('falls back to the optimistic value when the response omits the field', async () => {
      mocks.patchDocument.mockResolvedValue({
        data: { document_type_id: 'human-type' },
        error: undefined,
      });

      const result = await handlers.onUpdate({
        transaction: { mutations: [updateMutation] },
      });

      expect(result[0]).toMatchObject({
        humanRequiredDocumentTypeId: 'human-type',
        documentTypeId: 'human-type',
      });
    });
  });

  describe('onInsert', () => {
    it('persists a new assignment via the PATCH upsert and fails closed on error (H6)', async () => {
      mocks.patchDocument.mockResolvedValue({
        data: undefined,
        error: { detail: 'boom' },
      });

      await expect(
        handlers.onInsert({ transaction: { mutations: [insertMutation] } }),
      ).rejects.toThrow('Failed to persist document assignment');

      expect(mocks.patchDocument).toHaveBeenCalledWith({
        path: { project_id: 'project-1', file_id: 'file-1' },
        body: { human_required_document_type_id: 'human-type' },
      });
    });

    it('reconciles a new assignment from the backend response on success', async () => {
      mocks.patchDocument.mockResolvedValue({
        data: {
          ai_suggested_required_document_type_id: null,
          human_required_document_type_id: 'human-type',
        },
        error: undefined,
      });

      const result = await handlers.onInsert({
        transaction: { mutations: [insertMutation] },
      });

      expect(result[0]).toMatchObject({
        documentId: 'file-1',
        humanRequiredDocumentTypeId: 'human-type',
        documentTypeId: 'human-type',
      });
    });
  });
});

/**
 * Projection (read) tests for the `queryFn` integration-boundary transform.
 *
 * These are distinct from the mutation/persistence handler tests above: they
 * feed representative raw API rows through the collection's query mapper and
 * assert the projected local-row shape (human-over-AI precedence, required
 * document name enrichment, and null fallbacks).
 */
describe('documentAssignmentsCollection queryFn projection', () => {
  const projectId = 'project-1';

  const queryFnContext: QueryFnContext = {
    meta: { loadSubsetOptions: { projectId } },
  };

  /**
   * Drives `parseLoadSubsetOptions` to surface the real project id so the
   * `queryFn` does not early-return an empty list, then wires the assignments
   * and required-types responses for one projection run.
   */
  const runProjection = async (params: {
    items: {
      file_id: string;
      ai_suggested_required_document_type_id: string | null;
      human_required_document_type_id: string | null;
    }[];
    requiredTypeNames: Record<string, string>;
  }) => {
    mocks.parseLoadSubsetOptions.mockReturnValue({
      filters: [{ field: ['projectId'], value: projectId }],
    });
    mocks.getDocAssignments.mockResolvedValue({
      data: { items: params.items },
    });
    mocks.fetchQuery.mockResolvedValue({
      categories: [
        {
          category_id: 'cat-1',
          category_name: 'Kategorie',
          required_documents: Object.entries(params.requiredTypeNames).map(
            ([document_type_id, document_name]) => ({
              document_type_id,
              document_name,
            }),
          ),
        },
      ],
    });

    return handlers.queryFn(queryFnContext);
  };

  beforeEach(() => {
    mocks.parseLoadSubsetOptions.mockReset();
    mocks.getDocAssignments.mockReset();
    mocks.fetchQuery.mockReset();
  });

  it('returns an empty list when no project id can be resolved', async () => {
    mocks.parseLoadSubsetOptions.mockReturnValue({ filters: [] });

    const result = await handlers.queryFn(queryFnContext);

    expect(result).toEqual([]);
    expect(mocks.getDocAssignments).not.toHaveBeenCalled();
  });

  it('prefers the human-assigned type over the AI suggestion (precedence)', async () => {
    const result = await runProjection({
      items: [
        {
          file_id: 'file-1',
          ai_suggested_required_document_type_id: 'ai-type',
          human_required_document_type_id: 'human-type',
        },
      ],
      requiredTypeNames: { 'human-type': 'Lageplan', 'ai-type': 'Bauantrag' },
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      projectId,
      documentId: 'file-1',
      aiSuggestedDocumentTypeId: 'ai-type',
      humanRequiredDocumentTypeId: 'human-type',
      documentTypeId: 'human-type',
      documentTypeName: 'Lageplan',
      isResolved: false,
    });
  });

  it('falls back to the AI suggestion when no human type is assigned', async () => {
    const result = await runProjection({
      items: [
        {
          file_id: 'file-2',
          ai_suggested_required_document_type_id: 'ai-type',
          human_required_document_type_id: null,
        },
      ],
      requiredTypeNames: { 'ai-type': 'Bauantrag' },
    });

    expect(result[0]).toMatchObject({
      documentId: 'file-2',
      aiSuggestedDocumentTypeId: 'ai-type',
      humanRequiredDocumentTypeId: null,
      documentTypeId: 'ai-type',
      documentTypeName: 'Bauantrag',
    });
  });

  it('enriches the effective type id with the matching required-document name', async () => {
    const result = await runProjection({
      items: [
        {
          file_id: 'file-3',
          ai_suggested_required_document_type_id: 'ai-type',
          human_required_document_type_id: 'human-type',
        },
      ],
      // The map intentionally only resolves the human (winning) type to prove
      // the name comes from the precedence-selected id, not the AI suggestion.
      requiredTypeNames: { 'human-type': 'Grundbuchauszug' },
    });

    expect(result[0]).toMatchObject({
      documentTypeId: 'human-type',
      documentTypeName: 'Grundbuchauszug',
    });
  });

  it('resolves the name to null when the effective type id is unknown to the type map', async () => {
    const result = await runProjection({
      items: [
        {
          file_id: 'file-4',
          ai_suggested_required_document_type_id: 'ai-type',
          human_required_document_type_id: null,
        },
      ],
      requiredTypeNames: { 'other-type': 'Lageplan' },
    });

    expect(result[0]).toMatchObject({
      documentTypeId: 'ai-type',
      documentTypeName: null,
    });
  });

  it('resolves both type id and name to null when neither type is present', async () => {
    const result = await runProjection({
      items: [
        {
          file_id: 'file-5',
          ai_suggested_required_document_type_id: null,
          human_required_document_type_id: null,
        },
      ],
      requiredTypeNames: { 'human-type': 'Lageplan' },
    });

    expect(result[0]).toMatchObject({
      aiSuggestedDocumentTypeId: null,
      humanRequiredDocumentTypeId: null,
      documentTypeId: null,
      documentTypeName: null,
    });
  });

  it('projects each raw row independently, applying precedence per item', async () => {
    const result = await runProjection({
      items: [
        {
          file_id: 'file-human',
          ai_suggested_required_document_type_id: 'ai-type',
          human_required_document_type_id: 'human-type',
        },
        {
          file_id: 'file-ai',
          ai_suggested_required_document_type_id: 'ai-type',
          human_required_document_type_id: null,
        },
        {
          file_id: 'file-none',
          ai_suggested_required_document_type_id: null,
          human_required_document_type_id: null,
        },
      ],
      requiredTypeNames: { 'human-type': 'Lageplan', 'ai-type': 'Bauantrag' },
    });

    expect(result.map((row) => row.documentId)).toEqual([
      'file-human',
      'file-ai',
      'file-none',
    ]);
    expect(result[0]).toMatchObject({
      documentTypeId: 'human-type',
      documentTypeName: 'Lageplan',
    });
    expect(result[1]).toMatchObject({
      documentTypeId: 'ai-type',
      documentTypeName: 'Bauantrag',
    });
    expect(result[2]).toMatchObject({
      documentTypeId: null,
      documentTypeName: null,
    });
  });

  it('throws when the assignments response has no data', async () => {
    mocks.parseLoadSubsetOptions.mockReturnValue({
      filters: [{ field: ['projectId'], value: projectId }],
    });
    mocks.getDocAssignments.mockResolvedValue({ data: undefined });
    mocks.fetchQuery.mockResolvedValue({ categories: [] });

    await expect(handlers.queryFn(queryFnContext)).rejects.toThrow(
      'Failed to fetch document assignments',
    );
  });
});
