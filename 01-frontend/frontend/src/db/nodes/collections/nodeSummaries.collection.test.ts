import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getNodeSummariesCollection } from './nodeSummaries.collection';

const mocks = vi.hoisted(() => ({
  createCollection: vi.fn(),
  dmsListNodes: vi.fn(),
  examListNodes: vi.fn(),
  feedbackListNodes: vi.fn(),
  omsListNodes: vi.fn(),
  plsListNodes: vi.fn(),
  vaeListNodes: vi.fn(),
}));

vi.mock('@/api-clients/backend', () => ({
  v1DocumentManagementServiceListNodes: (...args: unknown[]) =>
    mocks.dmsListNodes(...args),
  v1ExaminationServiceListNodes: (...args: unknown[]) =>
    mocks.examListNodes(...args),
  v1FeedbackListNodes: (...args: unknown[]) => mocks.feedbackListNodes(...args),
  v1ObjectionsManagementServiceListNodes: (...args: unknown[]) =>
    mocks.omsListNodes(...args),
  v1ProjectLogicServiceListNodes: (...args: unknown[]) =>
    mocks.plsListNodes(...args),
  v1AdministrativeFileDraftListNodes: (...args: unknown[]) =>
    mocks.vaeListNodes(...args),
}));

vi.mock('@/integrations/tanstack-query/root-provider', () => ({
  queryClient: {},
}));

vi.mock('@tanstack/query-db-collection', () => ({
  queryCollectionOptions: (options: object) => ({
    ...options,
    sync: {
      sync: vi.fn(() => ({})),
    },
  }),
}));

vi.mock('@tanstack/react-db', () => ({
  BasicIndex: class BasicIndex {},
  createCollection: (...args: unknown[]) => mocks.createCollection(...args),
}));

describe('nodeSummaries.collection', () => {
  beforeEach(() => {
    mocks.createCollection.mockReset();
    mocks.createCollection.mockImplementation((options: object) => options);
    mocks.dmsListNodes.mockReset();
    mocks.examListNodes.mockReset();
    mocks.feedbackListNodes.mockReset();
    mocks.omsListNodes.mockReset();
    mocks.plsListNodes.mockReset();
    mocks.vaeListNodes.mockReset();

    mocks.examListNodes.mockResolvedValue({
      data: {
        nodes: [
          {
            frontendParentIds: [],
            id: 'topic-1',
            isOutdated: false,
            nodeType: 'topic',
            parents: [],
          },
        ],
      },
    });
    mocks.feedbackListNodes.mockResolvedValue({
      data: {
        nodes: [
          {
            id: 'feedback-1',
            nodeType: 'feedback',
            parents: [],
            frontendParentIds: ['topic-1'],
          },
        ],
      },
    });
    mocks.plsListNodes.mockResolvedValue({
      data: { nodes: [] },
    });
    mocks.dmsListNodes.mockResolvedValue({
      data: { nodes: [] },
    });
    mocks.omsListNodes.mockResolvedValue({
      data: {
        nodes: [
          {
            id: 'entry-1',
            isOutdated: false,
            nodeType: 'beteiligungs_eingang',
            parents: [],
            frontendParentIds: [],
          },
        ],
      },
    });
    mocks.vaeListNodes.mockResolvedValue({
      data: { nodes: [] },
    });
  });

  it('merges feedback and OMS summaries into the shared graph collection', async () => {
    const collection = getNodeSummariesCollection(
      'verfahren-feedback-test',
      1,
    ) as unknown as {
      queryFn: () => Promise<
        {
          compositeKey: string;
          frontendParentIds?: string[];
          id: string;
          nodeType: string;
          parents: { id: string; nodeType: string }[];
        }[]
      >;
    };

    const summaries = await collection.queryFn();

    expect(mocks.feedbackListNodes).toHaveBeenCalledWith({
      path: { projectId: 'verfahren-feedback-test' },
      query: { projectVersion: 1 },
      throwOnError: true,
    });
    expect(mocks.omsListNodes).toHaveBeenCalledWith({
      path: { projectId: 'verfahren-feedback-test' },
      query: { projectVersion: 1 },
      throwOnError: true,
    });
    expect(summaries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          compositeKey: 'feedback:feedback-1',
          frontendParentIds: ['topic-1'],
          id: 'feedback-1',
          nodeType: 'feedback',
        }),
        expect.objectContaining({
          compositeKey: 'beteiligungs_eingang:entry-1',
          frontendParentIds: [],
          id: 'entry-1',
          nodeType: 'beteiligungs_eingang',
        }),
      ]),
    );
  });

  it('preserves backend is_outdated flags on examination summaries', async () => {
    mocks.examListNodes.mockResolvedValue({
      data: {
        nodes: [
          {
            frontendParentIds: [],
            id: 'topic-1',
            isOutdated: false,
            nodeType: 'topic',
            parents: [],
          },
          {
            frontendParentIds: [],
            id: 'fundstelle-1',
            isOutdated: true,
            nodeType: 'fundstelle',
            parents: [],
          },
          {
            frontendParentIds: [],
            id: 'bewertung-1',
            isOutdated: true,
            nodeType: 'bewertung',
            parents: [],
          },
          {
            frontendParentIds: [],
            id: 'bewertung-quelle-1',
            isOutdated: true,
            nodeType: 'bewertung_quelle',
            parents: [],
          },
        ],
      },
    });
    const collection = getNodeSummariesCollection(
      'verfahren-outdated-test',
      1,
    ) as unknown as {
      queryFn: () => Promise<
        {
          id: string;
          isOutdated: boolean;
          nodeType: string;
        }[]
      >;
    };

    const summaries = await collection.queryFn();

    expect(
      summaries.find((summary) => summary.id === 'topic-1'),
    ).toHaveProperty('isOutdated', false);
    expect(summaries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'fundstelle-1',
          isOutdated: true,
        }),
        expect.objectContaining({
          id: 'bewertung-1',
          isOutdated: true,
        }),
        expect.objectContaining({
          id: 'bewertung-quelle-1',
          isOutdated: true,
        }),
      ]),
    );
  });
});
