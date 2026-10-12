import { beforeEach, describe, expect, it, vi } from 'vitest';
import { requiredDocumentsCollection } from './requiredDocuments.collection';

const mocks = vi.hoisted(() => ({
  deleteRequiredDocumentType: vi.fn(),
  invalidateQueries: vi.fn(),
}));

vi.mock('@/api-clients/backend', () => ({
  v1FormalCompletenessCreateRequiredDocumentType: vi.fn(),
  v1FormalCompletenessDeleteRequiredDocumentType: (...args: unknown[]) =>
    mocks.deleteRequiredDocumentType(...args),
  v1FormalCompletenessPatchRequiredDocumentType: vi.fn(),
}));

vi.mock('@/api-clients/backend/@tanstack/react-query.gen', () => ({
  v1FormalCompletenessGetRequiredDocumentTypesOptions: vi.fn(),
}));

vi.mock('@/integrations/tanstack-query/root-provider', () => ({
  queryClient: {
    fetchQuery: vi.fn(),
    invalidateQueries: (...args: unknown[]) => mocks.invalidateQueries(...args),
  },
}));

vi.mock('@tanstack/query-db-collection', () => ({
  parseLoadSubsetOptions: () => ({ filters: [] }),
  queryCollectionOptions: (options: object) => options,
}));

vi.mock('@tanstack/react-db', () => ({
  createCollection: (options: object) => ({ ...options, utils: {} }),
}));

type DeleteHandler = (args: {
  transaction: { mutations: unknown[] };
}) => Promise<unknown>;

const onDelete = (
  requiredDocumentsCollection as unknown as { onDelete: DeleteHandler }
).onDelete;

const transaction = {
  mutations: [{ original: { projectId: 'project-1' }, key: 'doc-1' }],
};

describe('requiredDocumentsCollection.onDelete (H2)', () => {
  beforeEach(() => {
    mocks.deleteRequiredDocumentType.mockReset();
    mocks.invalidateQueries.mockReset();
    mocks.invalidateQueries.mockResolvedValue(undefined);
  });

  it('calls the DMS delete with throwOnError so failures fail closed', async () => {
    mocks.deleteRequiredDocumentType.mockResolvedValue({ data: {} });

    await onDelete({ transaction });

    expect(mocks.deleteRequiredDocumentType).toHaveBeenCalledWith({
      path: { projectId: 'project-1', documentTypeId: 'doc-1' },
      throwOnError: true,
    });
  });

  it('rejects (rolling back) when the delete fails', async () => {
    mocks.deleteRequiredDocumentType.mockRejectedValue(new Error('boom'));

    await expect(onDelete({ transaction })).rejects.toThrow('boom');
    expect(mocks.invalidateQueries).not.toHaveBeenCalled();
  });
});
