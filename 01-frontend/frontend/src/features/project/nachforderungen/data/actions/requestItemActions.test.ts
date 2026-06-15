import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createSupplementaryRequestProjectsProjectIdSupplementaryRequestsPost } from '@/api-clients/supplementary-requests-module';
import { requestItemsCollection } from '@/features/project/nachforderungen/data/collections/requestItems.collection';
import { addRequestItem } from './requestItemActions';

vi.mock('@/api-clients/supplementary-requests-module', () => ({
  createSupplementaryRequestProjectsProjectIdSupplementaryRequestsPost: vi.fn(),
  deleteSupplementaryRequestProjectsProjectIdSupplementaryRequestsRequestIdDelete:
    vi.fn(),
  listSupplementaryRequestsProjectsProjectIdSupplementaryRequestsGet: vi.fn(),
  updateSupplementaryRequestProjectsProjectIdSupplementaryRequestsRequestIdPatch:
    vi.fn(),
}));

const createSupplementaryRequestMock = vi.mocked(
  createSupplementaryRequestProjectsProjectIdSupplementaryRequestsPost,
);

describe('addRequestItem', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    createSupplementaryRequestMock.mockReset();
  });

  it('writes the created item and refetches request items after create', async () => {
    const writeInsert = vi
      .spyOn(requestItemsCollection.utils, 'writeInsert')
      .mockImplementation(() => undefined);
    const refetch = vi
      .spyOn(requestItemsCollection.utils, 'refetch')
      .mockResolvedValue([]);
    createSupplementaryRequestMock.mockResolvedValue({
      data: {
        id: 'request-1',
        project_id: 'project-1',
        title: 'Missing document',
        reason: 'Please provide this document',
        priority: 'must',
        source_ref: {
          type: 'requiredDocuments',
          item_id: 'document-type-1',
        },
        included_in_letter: false,
        document_id: null,
        topic_id: null,
        created_at: '2026-05-26T12:00:00.000Z',
        updated_at: '2026-05-26T12:00:00.000Z',
      },
      request: new Request('http://localhost/request'),
      response: new Response(),
    });

    await addRequestItem(
      'project-1',
      'must',
      'Missing document',
      'Please provide this document',
      { type: 'requiredDocuments', itemId: 'document-type-1' },
    );

    expect(createSupplementaryRequestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          source_ref: {
            type: 'requiredDocuments',
            item_id: 'document-type-1',
          },
        }),
        throwOnError: true,
      }),
    );
    expect(writeInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceRef: {
          type: 'requiredDocuments',
          itemId: 'document-type-1',
        },
      }),
    );
    expect(refetch).toHaveBeenCalledOnce();
  });
});
