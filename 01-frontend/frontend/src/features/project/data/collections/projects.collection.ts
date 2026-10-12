import { v1ProjectLogicGetProjectQueryKey } from '@/api-clients/backend/@tanstack/react-query.gen';
import {
  v1ProjectLogicDeleteProject as deleteProjectRequest,
  v1ProjectLogicGetProject as getProject,
  v1ProjectLogicListProjects as listProjects,
  v1ProjectLogicUpdateProject as updateProject,
  type ProjectResponse,
  type V1ProjectLogicUpdateProjectData as UpdateProjectData,
  type V1ProjectLogicListProjectsData,
} from '@/api-clients/backend';
import { excludeSystemUserIds } from '@/features/access-control/system-users/systemUsers';
import {
  projectResponseArraySchema,
  projectResponseSchema,
} from '@/features/project/data/schemas/projectResponse.schema';
import { queryClient } from '@/integrations/tanstack-query/root-provider';
import {
  parseLoadSubsetOptions,
  queryCollectionOptions,
} from '@tanstack/query-db-collection';
import { createCollection, eq, useLiveQuery } from '@tanstack/react-db';
import { skipToken, useInfiniteQuery } from '@tanstack/react-query';

type UpdateProjectRequest = UpdateProjectData['body'];

const projectsQueryKey = ['projects'] as const;
const getProjectQueryKey = (projectId: string) =>
  [...projectsQueryKey, projectId] as const;
const projectNotFoundStatuses = new Set([404, 422]);

export class ProjectNotFoundError extends Error {
  constructor(projectId: string) {
    super(`Project not found: ${projectId}`);
    this.name = 'ProjectNotFoundError';
  }
}

export function isProjectNotFoundError(
  error: unknown,
): error is ProjectNotFoundError {
  return (
    error instanceof ProjectNotFoundError ||
    (error instanceof Error && error.name === 'ProjectNotFoundError')
  );
}

const extractProjectIdFilter = (
  opts?: Record<string, unknown>,
): string | undefined => {
  const parsed = parseLoadSubsetOptions(opts ?? {});
  const filter = parsed.filters.find(
    (f) => f.field.join('.') === 'id' && f.operator === 'eq',
  );

  return typeof filter?.value === 'string' && filter.value.length > 0
    ? filter.value
    : undefined;
};

function excludeSystemUsersFromProject(
  project: ProjectResponse,
): ProjectResponse {
  return {
    ...project,
    owners: excludeSystemUserIds(project.owners),
    members: excludeSystemUserIds(project.members),
  };
}

async function fetchProjectById(projectId: string): Promise<ProjectResponse> {
  const { data, response } = await getProject({
    path: { projectId: projectId },
  });
  const responseStatus = response?.status;

  if (
    responseStatus !== undefined &&
    projectNotFoundStatuses.has(responseStatus)
  ) {
    throw new ProjectNotFoundError(projectId);
  }

  if (!data) {
    throw new Error('Failed to fetch project');
  }

  return excludeSystemUsersFromProject(projectResponseSchema.parse(data));
}

const cacheProject = (project: ProjectResponse) => {
  const normalizedProject = excludeSystemUsersFromProject(project);
  queryClient.setQueryData(getProjectQueryKey(normalizedProject.id), [
    normalizedProject,
  ]);
  void queryClient.invalidateQueries({ queryKey: ['project-list'] });
  void queryClient.invalidateQueries({
    queryKey: v1ProjectLogicGetProjectQueryKey({
      path: { projectId: normalizedProject.id },
    }),
  });
};

async function deleteProject(projectId: string) {
  await deleteProjectRequest({
    path: { projectId: projectId },
    throwOnError: true,
  });
  const projectQueryKey = getProjectQueryKey(projectId);
  await queryClient.cancelQueries({ queryKey: projectQueryKey });
  queryClient.removeQueries({ queryKey: projectQueryKey });
  // The deleted detail must not be refetched while its route is still mounted.
  await queryClient.invalidateQueries({ queryKey: ['project-list'] });
  queryClient.setQueryData(projectQueryKey, []);
}

async function fetchAndCacheProject(
  projectId: string,
): Promise<ProjectResponse> {
  const projects = await queryClient.fetchQuery({
    queryKey: getProjectQueryKey(projectId),
    queryFn: async () => [await fetchProjectById(projectId)],
    retry: false,
  });
  const project = projects.at(0);

  if (!project) {
    throw new Error('Failed to fetch project');
  }

  return project;
}

async function refetchProject(projectId: string): Promise<ProjectResponse> {
  const project = await fetchProjectById(projectId);
  cacheProject(project);
  return project;
}

// Narrows a partial ProjectResponse to only UpdateProjectRequest-compatible
// fields. Identity fields such as createdById are intentionally excluded: the
// creator is session-derived on the backend and must never be patched from the
// client.
function toUpdateBody(changes: Partial<ProjectResponse>): UpdateProjectRequest {
  const {
    name,
    projectTypeId,
    entryDate,
    internalProjectNumber,
    state,
    salutation,
    company,
    firstName,
    lastName,
    street,
    houseNumber,
    addressSupplement,
    plz,
    location,
    country,
    email,
    phone,
    fax,
    currentProcessStepId,
  } = changes;
  return {
    name,
    projectTypeId,
    entryDate,
    internalProjectNumber,
    state,
    salutation,
    company,
    firstName,
    lastName,
    street,
    houseNumber,
    addressSupplement,
    plz,
    location,
    country,
    email,
    phone,
    fax,
    currentProcessStepId,
  };
}

const projectsCollectionBase = createCollection(
  queryCollectionOptions({
    id: 'projects',
    syncMode: 'on-demand',
    queryKey: (opts) => {
      const projectId = extractProjectIdFilter(opts as Record<string, unknown>);

      return projectId ? getProjectQueryKey(projectId) : projectsQueryKey;
    },
    queryFn: async (ctx): Promise<ProjectResponse[]> => {
      const projectId = extractProjectIdFilter(
        ctx.meta?.loadSubsetOptions as Record<string, unknown> | undefined,
      );

      return projectId ? [await fetchProjectById(projectId)] : [];
    },
    queryClient,
    getKey: (item) => item.id,
    onUpdate: async ({ transaction }) => {
      const results = await Promise.all(
        transaction.mutations.map(async ({ original, changes }) => {
          const { data } = await updateProject({
            path: { projectId: original.id },
            body: toUpdateBody(changes),
          });
          if (!data) {
            throw new Error('Failed to update project');
          }
          const project = projectResponseSchema.parse(data);
          cacheProject(project);
          return project;
        }),
      );
      return results;
    },
  }),
);

export const projectsCollection = Object.assign(projectsCollectionBase, {
  utils: Object.assign(projectsCollectionBase.utils, {
    deleteProject,
    fetchProject: fetchAndCacheProject,
    refetchProject,
  }),
});

export type ProjectListFilters = Omit<
  NonNullable<V1ProjectLogicListProjectsData['query']>,
  'limit' | 'offset'
>;

/**
 * Query identity includes every filter so page offsets never cross dataset boundaries.
 * @param filters - Server-side filters over the complete authorized project set.
 * @returns Loaded pages and native continuation state; an empty ID selection performs no read.
 */
export const useProjectList = (filters: ProjectListFilters = {}) => {
  const query = useInfiniteQuery({
    queryKey: ['project-list', filters],
    initialPageParam: 0,
    queryFn:
      filters.ids?.length === 0
        ? skipToken
        : async ({ pageParam }) => {
            const { data } = await listProjects({
              query: { ...filters, limit: 50, offset: pageParam },
              throwOnError: true,
            });
            return projectResponseArraySchema
              .parse(data)
              .map(excludeSystemUsersFromProject);
          },
    getNextPageParam: (lastPage, _pages, lastPageParam) =>
      lastPage.length === 50 ? lastPageParam + lastPage.length : undefined,
  });
  return { ...query, data: query.data?.pages.flat() ?? [] };
};

export function useProject(projectId: string | null | undefined) {
  const result = useLiveQuery(
    (q) =>
      projectId
        ? q
            .from({ projects: projectsCollection })
            .where((row) => eq(row.projects.id, projectId))
        : undefined,
    [projectId],
  );

  return {
    ...result,
    data: result.data?.at(0) ?? null,
  };
}
