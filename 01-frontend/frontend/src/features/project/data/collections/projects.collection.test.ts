import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectResponse } from '@/api-clients/pls-module';
import {
  ProjectNotFoundError,
  projectsCollection,
} from './projects.collection';

const makeProjectResponse = (
  overrides: Partial<ProjectResponse> = {},
): ProjectResponse => ({
  id: 'p1',
  name: 'Test Project',
  projectTypeId: 'type-1',
  projectTypeName: 'TypeA',
  createdById: 'creator-1',
  entryDate: '2024-01-01',
  internalProjectNumber: 'AZ-001',
  statusId: 'status-1',
  statusName: 'Offen',
  createdAt: '2024-01-01T00:00:00Z',
  originalCreatedAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
  projectVersion: 1,
  latestVersion: 1,
  owners: [],
  members: [],
  ...overrides,
});

type ProjectMutation = {
  original: ProjectResponse;
  changes: Partial<ProjectResponse>;
};

type OnUpdateArgs = {
  transaction: {
    mutations: ProjectMutation[];
  };
};

type OnUpdateHandler = (args: OnUpdateArgs) => Promise<ProjectResponse[]>;
type QueryFnHandler = (ctx: { meta?: unknown }) => Promise<ProjectResponse[]>;

/**
 * The mocked createCollection spreads the queryCollectionOptions onto the
 * returned collection, so the option handlers are present at runtime even
 * though they are not part of the public collection type. These helpers read
 * those handlers with a runtime check instead of an unchecked cast.
 */
const getCollectionFn = (name: 'onUpdate' | 'queryFn'): unknown => {
  const handler = Reflect.get(projectsCollection, name);
  if (typeof handler !== 'function') {
    throw new Error(`Expected projectsCollection.${name} to be a function`);
  }
  return handler;
};

const onUpdateHandler = getCollectionFn('onUpdate') as OnUpdateHandler;
const queryFnHandler = getCollectionFn('queryFn') as QueryFnHandler;

const mocks = vi.hoisted(() => ({
  createCollection: vi.fn((options: object) => ({
    ...options,
    utils: {},
  })),
  deleteProject: vi.fn(),
  fetchQuery: vi.fn(),
  getProject: vi.fn(),
  invalidateQueries: vi.fn(),
  listProjects: vi.fn(),
  setQueryData: vi.fn(),
  updateProject: vi.fn(),
}));

vi.mock('@/api-clients/pls-module', () => ({
  deleteProjectProjectsProjectIdDelete: (...args: unknown[]) =>
    mocks.deleteProject(...args),
  getProjectProjectsProjectIdGet: (...args: unknown[]) =>
    mocks.getProject(...args),
  listProjectsProjectsGet: (...args: unknown[]) => mocks.listProjects(...args),
  updateProjectProjectsProjectIdPatch: (...args: unknown[]) =>
    mocks.updateProject(...args),
}));

vi.mock('@/integrations/tanstack-query/root-provider', () => ({
  queryClient: {
    fetchQuery: (...args: unknown[]) => mocks.fetchQuery(...args),
    invalidateQueries: (...args: unknown[]) => mocks.invalidateQueries(...args),
    setQueryData: (...args: unknown[]) => mocks.setQueryData(...args),
  },
}));

vi.mock('@tanstack/query-db-collection', () => ({
  parseLoadSubsetOptions: () => ({ filters: [] }),
  queryCollectionOptions: (options: object) => options,
}));

vi.mock('@tanstack/react-db', () => ({
  createCollection: (options: object) => mocks.createCollection(options),
  eq: vi.fn(),
  useLiveQuery: vi.fn(),
}));

describe('projectsCollection', () => {
  beforeEach(() => {
    mocks.createCollection.mockReset();
    mocks.createCollection.mockImplementation((options: object) => ({
      ...options,
      utils: {},
    }));
    mocks.deleteProject.mockReset();
    mocks.fetchQuery.mockReset();
    mocks.fetchQuery.mockImplementation((options: { queryFn: () => unknown }) =>
      options.queryFn(),
    );
    mocks.getProject.mockReset();
    mocks.invalidateQueries.mockReset();
    mocks.listProjects.mockReset();
    mocks.setQueryData.mockReset();
    mocks.updateProject.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([404, 422])(
    'treats project GET %i as a not-found project',
    async (status) => {
      mocks.getProject.mockResolvedValue({
        data: undefined,
        response: { status },
      });

      await expect(
        projectsCollection.utils.fetchProject('project-missing'),
      ).rejects.toBeInstanceOf(ProjectNotFoundError);

      expect(mocks.getProject).toHaveBeenCalledWith({
        path: { project_id: 'project-missing' },
      });
    },
  );

  it('delays project list invalidation and filters the deleted project from cached queries', async () => {
    vi.useFakeTimers();

    const clearPromise =
      projectsCollection.utils.clearDeletedProject('project-deleted');

    await Promise.resolve();

    expect(mocks.invalidateQueries).not.toHaveBeenCalled();
    expect(mocks.setQueryData).not.toHaveBeenCalled();

    await vi.runOnlyPendingTimersAsync();
    await clearPromise;

    expect(mocks.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['projects'],
    });

    const listCacheWrite = mocks.setQueryData.mock.calls.find(
      ([queryKey]) =>
        Array.isArray(queryKey) &&
        queryKey.length === 1 &&
        queryKey[0] === 'projects',
    );
    const listUpdater = listCacheWrite?.[1] as
      | ((projects: ProjectResponse[]) => ProjectResponse[])
      | undefined;

    expect(
      listUpdater?.([
        { id: 'project-deleted' },
        { id: 'project-kept' },
      ] as ProjectResponse[]),
    ).toEqual([{ id: 'project-kept' }]);
    expect(mocks.setQueryData).toHaveBeenCalledWith(
      ['projects', 'project-deleted'],
      [],
    );
  });

  it('deletes a project via the generated client before clearing project caches', async () => {
    vi.useFakeTimers();
    mocks.deleteProject.mockResolvedValue({});

    const deletePromise =
      projectsCollection.utils.deleteProject('project-deleted');
    await Promise.resolve();

    expect(mocks.deleteProject).toHaveBeenCalledWith({
      path: { project_id: 'project-deleted' },
      throwOnError: true,
    });
    await vi.runOnlyPendingTimersAsync();
    await deletePromise;

    expect(mocks.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['projects'],
    });
  });

  describe('onUpdate', () => {
    it('omits the client-authored createdById from the update request body', async () => {
      const updated = makeProjectResponse({ id: 'p1', name: 'Renamed' });
      mocks.updateProject.mockResolvedValue({ data: updated });

      await onUpdateHandler({
        transaction: {
          mutations: [
            {
              original: makeProjectResponse({ id: 'p1' }),
              changes: { name: 'Renamed', createdById: 'attacker-spoof' },
            },
          ],
        },
      });

      expect(mocks.updateProject).toHaveBeenCalledTimes(1);
      const [updateArgs] = mocks.updateProject.mock.calls[0] as [
        { path: { project_id: string }; body: Record<string, unknown> },
      ];
      expect(updateArgs.path).toEqual({ project_id: 'p1' });
      expect(updateArgs.body).not.toHaveProperty('createdById');
      expect(updateArgs.body.name).toBe('Renamed');
    });

    it('persists every mutation in a multi-key update transaction', async () => {
      mocks.updateProject.mockImplementation(
        (args: { path: { project_id: string } }) => ({
          data: makeProjectResponse({
            id: args.path.project_id,
            name: `name-${args.path.project_id}`,
          }),
        }),
      );

      const results = await onUpdateHandler({
        transaction: {
          mutations: [
            {
              original: makeProjectResponse({ id: 'p1' }),
              changes: { name: 'name-p1' },
            },
            {
              original: makeProjectResponse({ id: 'p2' }),
              changes: { name: 'name-p2' },
            },
          ],
        },
      });

      expect(mocks.updateProject).toHaveBeenCalledTimes(2);
      const patchedIds = mocks.updateProject.mock.calls.map(
        ([args]) => (args as { path: { project_id: string } }).path.project_id,
      );
      expect(patchedIds).toEqual(['p1', 'p2']);
      expect(results.map((project) => project.id)).toEqual(['p1', 'p2']);
    });
  });

  describe('list queryFn runtime validation', () => {
    it('parses valid project rows into collection state', async () => {
      const valid = makeProjectResponse({ id: 'valid-1' });
      mocks.listProjects.mockResolvedValue({ data: [valid] });

      const result = await queryFnHandler({});

      expect(result).toHaveLength(1);
      expect(result[0]?.id).toBe('valid-1');
    });

    it('rejects malformed API rows instead of ingesting them', async () => {
      mocks.listProjects.mockResolvedValue({
        data: [{ id: 123, name: 'missing required fields' }],
      });

      await expect(queryFnHandler({})).rejects.toThrow();
    });
  });
});
