import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DeadlineResponse } from '@/api-clients/pls-module';
import { allDeadlinesCollection } from './allDeadlines.collection';

const mocks = vi.hoisted(() => ({
  createCollection: vi.fn((options: object) => ({ ...options, utils: {} })),
  listDeadlines: vi.fn(),
}));

vi.mock('@/api-clients/pls-module', () => ({
  listDeadlinesDeadlinesGet: (...args: unknown[]) =>
    mocks.listDeadlines(...args),
}));

vi.mock('@/integrations/tanstack-query/root-provider', () => ({
  queryClient: {},
}));

vi.mock('@tanstack/query-db-collection', () => ({
  queryCollectionOptions: (options: object) => options,
}));

vi.mock('@tanstack/react-db', () => ({
  createCollection: (options: object) => mocks.createCollection(options),
}));

type QueryFnHandler = () => Promise<DeadlineResponse[]>;

const getQueryFn = (): QueryFnHandler => {
  const handler = Reflect.get(allDeadlinesCollection, 'queryFn');
  if (typeof handler !== 'function') {
    throw new Error('Expected allDeadlinesCollection.queryFn to be a function');
  }
  return handler as QueryFnHandler;
};

const validDeadline: DeadlineResponse = {
  id: 'd1',
  projectId: 'p1',
  startAt: '2024-01-01T00:00:00Z',
  endAt: '2024-02-01T00:00:00Z',
  deadlineType: 'review',
  legalBasis: null,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
};

describe('allDeadlinesCollection queryFn', () => {
  const queryFn = getQueryFn();

  beforeEach(() => {
    mocks.listDeadlines.mockReset();
  });

  it('throws when the request returns no data (error state)', async () => {
    mocks.listDeadlines.mockResolvedValue({ data: undefined });

    await expect(queryFn()).rejects.toThrow('Failed to fetch deadlines');
  });

  it('parses valid deadline rows', async () => {
    mocks.listDeadlines.mockResolvedValue({ data: [validDeadline] });

    await expect(queryFn()).resolves.toEqual([validDeadline]);
  });

  it('rejects malformed deadline rows', async () => {
    mocks.listDeadlines.mockResolvedValue({
      data: [{ id: 'd1', projectId: 'p1' }],
    });

    await expect(queryFn()).rejects.toThrow();
  });
});
