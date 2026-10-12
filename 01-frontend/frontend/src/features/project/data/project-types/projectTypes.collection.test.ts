import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectTypeResponse } from '@/api-clients/backend';
import { projectTypesCollection } from './projectTypes.collection';

const mocks = vi.hoisted(() => ({
  createCollection: vi.fn((options: object) => ({ ...options, utils: {} })),
  listProjectTypes: vi.fn(),
}));

vi.mock('@/api-clients/backend', () => ({
  v1ProjectLogicListProjectTypes: (...args: unknown[]) =>
    mocks.listProjectTypes(...args),
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

type QueryFnHandler = () => Promise<ProjectTypeResponse[]>;

const getHandler = <T>(name: string): T => {
  const handler = Reflect.get(projectTypesCollection, name);
  if (typeof handler !== 'function') {
    throw new Error(`Expected projectTypesCollection.${name} to be a function`);
  }
  return handler as T;
};

describe('projectTypesCollection queryFn', () => {
  const queryFn = getHandler<QueryFnHandler>('queryFn');

  beforeEach(() => {
    mocks.listProjectTypes.mockReset();
  });

  it('throws when the request returns no data so the collection can reach an error state', async () => {
    mocks.listProjectTypes.mockResolvedValue({ data: undefined });

    await expect(queryFn()).rejects.toThrow('Failed to fetch project types');
  });

  it('does not pass throwOnError:false to the generated client', async () => {
    mocks.listProjectTypes.mockResolvedValue({
      data: [{ id: 't1', name: 'Type 1', active: true }],
    });

    await queryFn();

    const callArgs = mocks.listProjectTypes.mock.calls[0]?.[0] as
      | { throwOnError?: boolean }
      | undefined;
    expect(callArgs?.throwOnError).not.toBe(false);
  });

  it('parses a valid (possibly empty) project-type list', async () => {
    mocks.listProjectTypes.mockResolvedValue({ data: [] });

    await expect(queryFn()).resolves.toEqual([]);

    mocks.listProjectTypes.mockResolvedValue({
      data: [{ id: 't1', name: 'Type 1', active: true }],
    });

    await expect(queryFn()).resolves.toEqual([
      { id: 't1', name: 'Type 1', active: true },
    ]);
  });

  it('rejects malformed project-type rows', async () => {
    mocks.listProjectTypes.mockResolvedValue({
      data: [{ id: 't1' }],
    });

    await expect(queryFn()).rejects.toThrow();
  });
});
