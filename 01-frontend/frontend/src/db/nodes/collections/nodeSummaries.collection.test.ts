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

vi.mock('@/api-clients/dms-module', () => ({
  listNodesProjectIdNodesGet: (...args: unknown[]) =>
    mocks.dmsListNodes(...args),
}));

vi.mock('@/api-clients/examination-module', () => ({
  listNodesProjectIdNodesGet: (...args: unknown[]) =>
    mocks.examListNodes(...args),
}));

vi.mock('@/api-clients/feedback-module', () => ({
  listNodesProjectIdNodesGet: (...args: unknown[]) =>
    mocks.feedbackListNodes(...args),
}));

vi.mock('@/api-clients/oms-module', () => ({
  listNodesProjectIdNodesGet: (...args: unknown[]) =>
    mocks.omsListNodes(...args),
}));

vi.mock('@/api-clients/pls-module', () => ({
  listNodesProjectIdNodesGet: (...args: unknown[]) =>
    mocks.plsListNodes(...args),
}));

vi.mock('@/api-clients/vae-module', () => ({
  listNodesProjectIdNodesGet: (...args: unknown[]) =>
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
            frontend_parent_ids: [],
            id: 'topic-1',
            is_outdated: false,
            node_type: 'topic',
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
            node_type: 'feedback',
            parents: [],
            frontend_parent_ids: ['topic-1'],
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
            is_outdated: false,
            node_type: 'beteiligungs_eingang',
            parents: [],
            frontend_parent_ids: [],
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
          frontend_parent_ids?: string[];
          id: string;
          node_type: string;
          parents: { id: string; node_type: string }[];
        }[]
      >;
    };

    const summaries = await collection.queryFn();

    expect(mocks.feedbackListNodes).toHaveBeenCalledWith({
      path: { project_id: 'verfahren-feedback-test' },
      query: { project_version: 1 },
      throwOnError: true,
    });
    expect(mocks.omsListNodes).toHaveBeenCalledWith({
      path: { project_id: 'verfahren-feedback-test' },
      query: { project_version: 1 },
      throwOnError: true,
    });
    expect(summaries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          compositeKey: 'feedback:feedback-1',
          frontend_parent_ids: ['topic-1'],
          id: 'feedback-1',
          node_type: 'feedback',
        }),
        expect.objectContaining({
          compositeKey: 'beteiligungs_eingang:entry-1',
          frontend_parent_ids: [],
          id: 'entry-1',
          node_type: 'beteiligungs_eingang',
        }),
      ]),
    );
  });

  it('preserves backend is_outdated flags on examination summaries', async () => {
    mocks.examListNodes.mockResolvedValue({
      data: {
        nodes: [
          {
            frontend_parent_ids: [],
            id: 'topic-1',
            is_outdated: false,
            node_type: 'topic',
            parents: [],
          },
          {
            frontend_parent_ids: [],
            id: 'fundstelle-1',
            is_outdated: true,
            node_type: 'fundstelle',
            parents: [],
          },
          {
            frontend_parent_ids: [],
            id: 'bewertung-1',
            is_outdated: true,
            node_type: 'bewertung',
            parents: [],
          },
          {
            frontend_parent_ids: [],
            id: 'bewertung-quelle-1',
            is_outdated: true,
            node_type: 'bewertung_quelle',
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
          is_outdated: boolean;
          node_type: string;
        }[]
      >;
    };

    const summaries = await collection.queryFn();

    expect(
      summaries.find((summary) => summary.id === 'topic-1'),
    ).toHaveProperty('is_outdated', false);
    expect(summaries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'fundstelle-1',
          is_outdated: true,
        }),
        expect.objectContaining({
          id: 'bewertung-1',
          is_outdated: true,
        }),
        expect.objectContaining({
          id: 'bewertung-quelle-1',
          is_outdated: true,
        }),
      ]),
    );
  });
});
