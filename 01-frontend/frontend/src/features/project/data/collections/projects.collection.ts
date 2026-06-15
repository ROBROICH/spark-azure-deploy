import {
  deleteProjectProjectsProjectIdDelete,
  getProjectProjectsProjectIdGet,
  listProjectsProjectsGet,
  updateProjectProjectsProjectIdPatch,
  type ProjectResponse,
  type UpdateProjectRequest,
} from '@/api-clients/pls-module';
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

const projectsQueryKey = ['projects'] as const;
const getProjectQueryKey = (projectId: string) =>
  [...projectsQueryKey, projectId] as const;
const invalidProjectIdQueryKey = [...projectsQueryKey, 'invalid-id'] as const;
const projectNotFoundStatuses = new Set([404, 422]);
const PROJECT_DELETE_CACHE_CLEAR_DELAY_MS = 750;

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

type ProjectIdFilter =
  | { type: 'none' }
  | { type: 'invalid' }
  | { type: 'project'; projectId: string };

const extractProjectIdFilter = (
  opts?: Record<string, unknown>,
): ProjectIdFilter => {
  const parsed = parseLoadSubsetOptions(opts ?? {});
  const filter = parsed.filters.find(
    (f) => f.field.join('.') === 'id' && f.operator === 'eq',
  );

  if (!filter) {
    return { type: 'none' };
  }

  const value = filter.value;

  if (typeof value !== 'string' || value.length === 0) {
    return { type: 'invalid' };
  }

  return { type: 'project', projectId: value };
};

function excludeSystemUsersFromProject(
  project: ProjectResponse,
): ProjectResponse {
  return {
    ...project,
    owners: project.owners
      ? excludeSystemUserIds(project.owners)
      : project.owners,
    members: project.members
      ? excludeSystemUserIds(project.members)
      : project.members,
  };
}

async function fetchProjectById(projectId: string): Promise<ProjectResponse> {
  const { data, response } = await getProjectProjectsProjectIdGet({
    path: { project_id: projectId },
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
  queryClient.setQueryData<ProjectResponse[] | undefined>(
    projectsQueryKey,
    (projects) =>
      projects?.map((candidate) =>
        candidate.id === normalizedProject.id ? normalizedProject : candidate,
      ),
  );
};

const delayProjectDeleteCacheClear = () =>
  new Promise<void>((resolve) => {
    globalThis.setTimeout(resolve, PROJECT_DELETE_CACHE_CLEAR_DELAY_MS);
  });

const removeDeletedProjectFromCache = (projectId: string) => {
  queryClient.setQueryData<ProjectResponse[] | undefined>(
    projectsQueryKey,
    (projects) => projects?.filter((candidate) => candidate.id !== projectId),
  );
  queryClient.setQueryData<ProjectResponse[] | undefined>(
    getProjectQueryKey(projectId),
    [],
  );
};

async function clearDeletedProject(projectId: string) {
  await delayProjectDeleteCacheClear();
  await queryClient.invalidateQueries({ queryKey: projectsQueryKey });
  removeDeletedProjectFromCache(projectId);
}

async function deleteProject(projectId: string) {
  await deleteProjectProjectsProjectIdDelete({
    path: { project_id: projectId },
    throwOnError: true,
  });
  await clearDeletedProject(projectId);
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
  return {
    name: changes.name,
    projectTypeId: changes.projectTypeId,
    entryDate: changes.entryDate,
    internalProjectNumber: changes.internalProjectNumber,
    state: changes.state,
    salutation: changes.salutation,
    company: changes.company,
    firstName: changes.firstName,
    lastName: changes.lastName,
    street: changes.street,
    houseNumber: changes.houseNumber,
    addressSupplement: changes.addressSupplement,
    plz: changes.plz,
    location: changes.location,
    country: changes.country,
    email: changes.email,
    phone: changes.phone,
    fax: changes.fax,
    currentProcessStepId: changes.currentProcessStepId,
  };
}

const projectsCollectionBase = createCollection(
  queryCollectionOptions({
    id: 'projects',
    syncMode: 'on-demand',
    queryKey: (opts) => {
      const projectIdFilter = extractProjectIdFilter(
        opts as Record<string, unknown>,
      );

      if (projectIdFilter.type === 'project') {
        return getProjectQueryKey(projectIdFilter.projectId);
      }

      if (projectIdFilter.type === 'invalid') {
        return invalidProjectIdQueryKey;
      }

      return projectsQueryKey;
    },
    queryFn: async (ctx): Promise<ProjectResponse[]> => {
      const projectIdFilter = extractProjectIdFilter(
        ctx.meta?.loadSubsetOptions as Record<string, unknown> | undefined,
      );

      if (projectIdFilter.type === 'project') {
        return [await fetchProjectById(projectIdFilter.projectId)];
      }

      if (projectIdFilter.type === 'invalid') {
        return [];
      }

      const { data } = await listProjectsProjectsGet();
      if (!data) {
        throw new Error('Failed to fetch projects');
      }

      const projects = projectResponseArraySchema
        .parse(data)
        .map(excludeSystemUsersFromProject);
      for (const project of projects) {
        queryClient.setQueryData(getProjectQueryKey(project.id), [project]);
      }

      return projects;
    },
    queryClient,
    getKey: (item) => item.id,
    onUpdate: async ({ transaction }) => {
      const results = await Promise.all(
        transaction.mutations.map(async ({ original, changes }) => {
          const { data } = await updateProjectProjectsProjectIdPatch({
            path: { project_id: original.id },
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
    clearDeletedProject,
    deleteProject,
    fetchProject: fetchAndCacheProject,
    refetchProject,
  }),
});

export const useAllProjects = () =>
  useLiveQuery((q) => q.from({ projects: projectsCollection }), []);

export function useProject(projectId: string | null | undefined) {
  const resolvedProjectId = projectId ?? '';
  const result = useLiveQuery(
    (q) =>
      q
        .from({ projects: projectsCollection })
        .where((row) => eq(row.projects.id, resolvedProjectId)),
    [resolvedProjectId],
  );

  return {
    ...result,
    data: result.data.at(0) ?? null,
  };
}
