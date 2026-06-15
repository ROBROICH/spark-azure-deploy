import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getNodePayloadsCollection,
  reloadNodePayloadsCollection,
} from './nodePayloads.collection';

const mocks = vi.hoisted(() => ({
  clearAll: vi.fn(),
  createCollection: vi.fn(),
  invalidateQueries: vi.fn(),
  loadMany: vi.fn(),
  parseWhereExpression: vi.fn(),
}));

vi.mock('@/integrations/tanstack-query/root-provider', () => ({
  queryClient: {
    invalidateQueries: mocks.invalidateQueries,
  },
}));

vi.mock('@tanstack/query-db-collection', () => ({
  parseWhereExpression: (...args: unknown[]) =>
    mocks.parseWhereExpression(...args),
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

vi.mock('./payloadLoader', () => ({
  createNodeDataLoader: () => ({
    clearAll: mocks.clearAll,
    loadMany: mocks.loadMany,
  }),
}));

describe('nodePayloads.collection reloads', () => {
  beforeEach(() => {
    mocks.clearAll.mockReset();
    mocks.createCollection.mockReset();
    mocks.createCollection.mockImplementation(() => ({}));
    mocks.invalidateQueries.mockReset();
    mocks.loadMany.mockReset();
    mocks.parseWhereExpression.mockReset();
  });

  it('clears the live DataLoader cache before invalidating the query', async () => {
    getNodePayloadsCollection('verfahren-1', 1);

    await reloadNodePayloadsCollection('verfahren-1', 1);

    expect(mocks.clearAll).toHaveBeenCalledTimes(1);
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['node-payloads', 'verfahren-1'],
    });
  });

  it('keeps available payloads when a graph-hinted ref has no payload', async () => {
    mocks.parseWhereExpression.mockImplementation((_where, options) => {
      options.handlers.in('compositeKey'.split('.'), [
        'fundstelle:f-1',
        'fundstelle:f-missing',
      ]);
    });
    mocks.loadMany.mockResolvedValue([
      {
        compositeKey: 'fundstelle:f-1',
        id: 'f-1',
        node_type: 'fundstelle',
      },
      new Error('Missing node payload for fundstelle:f-missing'),
    ]);

    getNodePayloadsCollection('verfahren-filter-test', 1);
    const collectionOptions = mocks.createCollection.mock.calls[0]?.[0];

    const payloads = await collectionOptions.queryFn({
      meta: {
        loadSubsetOptions: {
          where: {},
        },
      },
    });

    expect(payloads).toEqual([
      {
        compositeKey: 'fundstelle:f-1',
        id: 'f-1',
        node_type: 'fundstelle',
      },
    ]);
  });

  it('rejects query loads without subset metadata', async () => {
    getNodePayloadsCollection('verfahren-missing-subset', 1);
    const collectionOptions = mocks.createCollection.mock.calls[0]?.[0];

    await expect(collectionOptions.queryFn({ meta: {} })).rejects.toThrow(
      'You need to pass in a where clause to fetch node payloads',
    );

    expect(mocks.loadMany).not.toHaveBeenCalled();
  });

  it('returns an empty payload list when no composite-key subset is present', async () => {
    mocks.parseWhereExpression.mockImplementation(() => undefined);

    getNodePayloadsCollection('verfahren-empty-subset', 1);
    const collectionOptions = mocks.createCollection.mock.calls[0]?.[0];

    await expect(
      collectionOptions.queryFn({
        meta: {
          loadSubsetOptions: {
            where: {},
          },
        },
      }),
    ).resolves.toEqual([]);
    expect(mocks.loadMany).not.toHaveBeenCalled();
  });

  it('rejects unsupported composite-key node types before loading payloads', async () => {
    mocks.parseWhereExpression.mockImplementation((_where, options) => {
      options.handlers.eq('compositeKey'.split('.'), 'unknown:node-1');
    });

    getNodePayloadsCollection('verfahren-unsupported-key', 1);
    const collectionOptions = mocks.createCollection.mock.calls[0]?.[0];

    await expect(
      collectionOptions.queryFn({
        meta: {
          loadSubsetOptions: {
            where: {},
          },
        },
      }),
    ).rejects.toThrow('Unknown composite node type: unknown');
    expect(mocks.loadMany).not.toHaveBeenCalled();
  });

  it('rejects empty composite-key ids before loading payloads', async () => {
    mocks.parseWhereExpression.mockImplementation((_where, options) => {
      options.handlers.eq('compositeKey'.split('.'), 'topic:');
    });

    getNodePayloadsCollection('verfahren-empty-key-id', 1);
    const collectionOptions = mocks.createCollection.mock.calls[0]?.[0];

    await expect(
      collectionOptions.queryFn({
        meta: {
          loadSubsetOptions: {
            where: {},
          },
        },
      }),
    ).rejects.toThrow('Invalid composite node key: topic:');
    expect(mocks.loadMany).not.toHaveBeenCalled();
  });
});
