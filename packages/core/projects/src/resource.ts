import { persistenceError } from "@spark-workflow/postgres-runtime";
import { isoInstant } from "@spark-workflow/http-host";
import {
  batchNodes as readNodes,
  executeNodeMutation as executeNodes,
  type NodeBase,
  type NodeMutationInput,
  type NodeMutationResult,
  type NodeRefInput,
  type NodeRuntime,
  type NodeSchema,
  type NodeVersionService,
  type NodeBatchReader,
  type RequestAuthorization,
  type ProjectVersionPeer,
} from "@spark-workflow/node-crud";
import { PostgreSQL } from "@spark-workflow/postgres-runtime";
import { defineResource, provide } from "@spark-workflow/resource";
import type { Static } from "@sinclair/typebox";
import { Result } from "better-result";
import { and, asc, eq } from "drizzle-orm";
import type { EvlogError } from "evlog";

import {
  projectLogicSchema,
  projectLogicNodeTables,
  projects,
  topics,
  topicNorms,
} from "./db/schema.ts";
import type { ProjectLogicScope } from "./db.ts";
import { projectErrors } from "./errors.ts";
import { getProjectExportMetadata, type ProjectExportMetadata } from "./data.ts";
import {
  createProjectRecord,
  type CreatedProject,
  type ProjectCreationInput,
} from "./project-creation.ts";
import { updateProjectStatusRecord } from "./project-status.ts";
import type { ProjectVersions } from "./project-versions.ts";
import {
  createProject,
  getProject,
  listProjectApplicants,
  listProjects,
  removeProject,
  updateProject,
} from "./projects.ts";
import { type ApplicantResponse, TopicNormResponseSchema, type TopicResponse } from "./schemas.ts";
import type {
  ProjectCommandConfiguration as ProjectCommandConfigurationValue,
  ProjectConfiguration as ProjectConfigurationValue,
} from "./env.ts";
import type { ProjectTemporalCommandsService } from "./temporal/commands.ts";

export const ProjectConfiguration = defineResource<ProjectConfigurationValue>()(
  "core/ProjectConfiguration",
);
export const ProjectCommandConfiguration = defineResource<ProjectCommandConfigurationValue>()(
  "core/ProjectCommandConfiguration",
);
export const ProjectTemporalCommands = defineResource<ProjectTemporalCommandsService>()(
  "core/ProjectTemporalCommands",
);

export type TopicNorm = Static<typeof TopicNormResponseSchema>;

export interface ProjectsService extends ProjectVersionPeer {
  projectTypeId(
    projectId: string,
    projectVersion: number,
  ): Promise<Result<string | null, EvlogError>>;
  getTopic(topicId: string): Promise<Result<TopicResponse, EvlogError>>;
  listTopics(
    projectId: string,
    projectVersion: number,
  ): Promise<Result<readonly TopicResponse[], EvlogError>>;
  listTopicNorms(topicId: string): Promise<Result<readonly TopicNorm[], EvlogError>>;
  batchNodes(
    projectId: string,
    projectVersion: number,
    refs: readonly NodeRefInput[],
  ): Promise<Result<readonly NodeBase[], EvlogError>>;
  executeNodeMutation(
    auth: RequestAuthorization,
    projectId: string,
    projectVersion: number,
    input: NodeMutationInput,
  ): Promise<Result<NodeMutationResult, EvlogError>>;
}

export interface ApplicantsService {
  list(projectId: string, projectVersion: number): Promise<readonly ApplicantResponse[]>;
  findUnique(
    projectId: string,
    projectVersion: number,
    applicantId: string,
  ): Promise<ApplicantResponse>;
}

export interface ProjectsResourceService extends ProjectsService {
  list(input: Parameters<typeof listProjects>[1]): ReturnType<typeof listProjects>;
  get(projectId: string): ReturnType<typeof getProject>;
  create(input: Parameters<typeof createProject>[1]): ReturnType<typeof createProject>;
  update(
    projectId: string,
    input: Parameters<typeof updateProject>[2],
  ): ReturnType<typeof updateProject>;
  delete(
    commands: ProjectTemporalCommandsService,
    projectId: string,
  ): ReturnType<typeof removeProject>;
  createProject<Output>(
    input: ProjectCreationInput,
    withinTransaction: (project: CreatedProject) => Promise<Output>,
  ): Promise<Result<Output, EvlogError>>;
  exportMetadata(projectId: string): Promise<Result<ProjectExportMetadata, EvlogError>>;
  updateStatus(
    projectId: string,
    internalName: Parameters<typeof updateProjectStatusRecord>[3],
  ): ReturnType<typeof updateProjectStatusRecord>;
}

export const Projects = defineResource<ProjectsResourceService>()("core/Projects");
export const Applicants = defineResource<ApplicantsService>()("core/Applicants");
export interface ProjectLogicVersioningService extends NodeVersionService {
  batchNodes: NodeBatchReader<typeof projectLogicNodeTables>;
}

export const ProjectLogicVersioning = defineResource<ProjectLogicVersioningService>()(
  "core/ProjectLogicVersioning",
);

const topicResponse = (row: typeof topics.$inferSelect): TopicResponse => ({
  id: row.id,
  projectId: row.projectId,
  parentTopicId: row.parentTopicId,
  name: row.name,
  description: row.description,
  showInMvp: row.showInMvp,
  showInEwm: row.showInEwm,
  showInBeschluss: row.showInBeschluss,
  isDeleted: row.isDeleted,
  createdAt: isoInstant(row.createdAt),
  updatedAt: isoInstant(row.updatedAt),
});

export function createProjectsService<Schema extends NodeSchema>(
  scope: ProjectLogicScope,
  nodeRuntime: NodeRuntime<Schema>,
  projectVersions: ProjectVersions,
): ProjectsResourceService {
  const currentTopic = async (topicId: string) => {
    const candidates = await scope.query((database) =>
      database.select().from(topics).where(eq(topics.id, topicId)),
    );
    const latest = await projectVersions.latest([
      ...new Set(candidates.map(({ projectId }) => projectId)),
    ]);
    const topic = candidates.find(
      (candidate) =>
        candidate.projectVersion === latest.get(candidate.projectId) && !candidate.isDeleted,
    );
    if (topic === undefined) {
      throw projectErrors.NOT_FOUND({ message: `Topic ${topicId} not found` });
    }
    return topic;
  };

  const service: ProjectsResourceService = {
    list: (input) => listProjects(scope, input),
    get: (projectId) => getProject(scope, projectId),
    create: (input) => createProject(scope, input),
    update: (projectId, input) => updateProject(scope, projectId, input),
    delete: (commands, projectId) => removeProject(scope, commands, projectId),
    createProject: (input, withinTransaction) =>
      createProjectRecord(scope, input, withinTransaction),
    exportMetadata: (projectId) =>
      Result.tryPromise({
        try: () => getProjectExportMetadata(scope, projectVersions, projectId),
        catch: persistenceError,
      }),
    resolveLatestVersion: (projectId) => projectVersions.resolveLatestVersion(projectId),
    validateWriteVersion: (projectId, projectVersion) =>
      projectVersions.validateWriteVersion(projectId, projectVersion),
    validateVersionLock: (input) => projectVersions.validateVersionLock(input),
    projectTypeId: (projectId, projectVersion) =>
      Result.tryPromise({
        catch: persistenceError,
        try: async () => {
          const [project] = await scope.query((database) =>
            database
              .select({ projectTypeId: projects.projectTypeId })
              .from(projects)
              .where(
                and(
                  eq(projects.id, projectId),
                  eq(projects.projectVersion, projectVersion),
                  eq(projects.isDeleted, false),
                ),
              )
              .limit(1),
          );
          if (project === undefined) {
            throw projectErrors.NOT_FOUND({ message: `Project ${projectId} not found` });
          }
          return project.projectTypeId;
        },
      }),
    updateStatus: (projectId, internalName) =>
      updateProjectStatusRecord(scope, projectVersions, projectId, internalName),
    getTopic: (topicId) =>
      Result.tryPromise({
        try: async () => topicResponse(await currentTopic(topicId)),
        catch: persistenceError,
      }),
    listTopics: (projectId, projectVersion) =>
      Result.tryPromise({
        catch: persistenceError,
        try: async () =>
          (
            await scope.query((database) =>
              database
                .select()
                .from(topics)
                .where(
                  and(
                    eq(topics.projectId, projectId),
                    eq(topics.projectVersion, projectVersion),
                    eq(topics.isDeleted, false),
                  ),
                )
                .orderBy(asc(topics.name)),
            )
          ).map(topicResponse),
      }),
    listTopicNorms: (topicId) =>
      Result.tryPromise({
        catch: persistenceError,
        try: async () => {
          const topic = await currentTopic(topicId);
          const rows = await scope.query((database) =>
            database
              .select()
              .from(topicNorms)
              .where(
                and(
                  eq(topicNorms.topicId, topicId),
                  eq(topicNorms.projectId, topic.projectId),
                  eq(topicNorms.projectVersion, topic.projectVersion),
                  eq(topicNorms.isDeleted, false),
                ),
              ),
          );
          return rows.map((row) => ({
            id: row.id,
            topicId: row.topicId,
            type: row.type.toLowerCase() as TopicNorm["type"],
            projectId: row.projectId,
            projectVersion: row.projectVersion,
            jurabk: row.jurabk,
            paragraphNr: row.paragraphNr ?? "",
            absatz: row.absatz,
            satz: row.satz,
            nummer: row.nummer,
            mvpStatus: row.mvpStatus as TopicNorm["mvpStatus"],
            satzStatuses: row.satzStatuses as TopicNorm["satzStatuses"],
          }));
        },
      }),
    batchNodes: (projectId, projectVersion, refs) =>
      Result.tryPromise({
        try: async () => (await readNodes(nodeRuntime, projectId, projectVersion, refs)).results,
        catch: persistenceError,
      }),
    executeNodeMutation: (auth, projectId, projectVersion, input) =>
      executeNodes(nodeRuntime, auth, projectId, projectVersion, input),
  };
  return Object.freeze(service);
}

export const applicantsProvider = provide({
  resource: Applicants,
  needs: { postgres: PostgreSQL },
  make: ({ postgres }) => {
    const scope = postgres.scope(projectLogicSchema);
    const list = async (projectId: string, projectVersion: number) => {
      const result = await listProjectApplicants(scope, projectId, projectVersion);
      if (result.isErr()) throw result.error;
      return result.value;
    };
    return Object.freeze<ApplicantsService>({
      list,
      async findUnique(projectId, projectVersion, applicantId) {
        const applicant = (await list(projectId, projectVersion)).find(
          ({ id }) => id === applicantId,
        );
        if (applicant === undefined) {
          throw projectErrors.NOT_FOUND({ message: `Applicant ${applicantId} not found` });
        }
        return applicant;
      },
    });
  },
});
