import { recordAuditEntry } from "@spark-workflow/audit-client/persistence";
import { authentication } from "@spark-workflow/authentification";
import { Type as T } from "@sinclair/typebox";
import { Result } from "better-result";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { status, t } from "elysia";

import { projectLogicModels, type ProjectLogicDatabase, type ProjectLogicScope } from "../db.ts";
import { projects } from "../db/schema.ts";
import { projectErrors } from "../errors.ts";
import type { CoreRouteApp } from "../http.ts";
import { projectCreatorId } from "../project-creation.ts";
import { updateProjectStatusRecord } from "../project-status.ts";
import { ProjectVersions } from "../project-versions.ts";
import {
  activeProjectVersion,
  createProject,
  getProject,
  listProjects,
  removeProject,
  updateProject,
} from "../projects.ts";
import {
  projectCreatePolicy,
  projectDeletePolicy,
  projectInitializePolicy,
  projectListPolicy,
  projectUpdatePolicy,
} from "../auth-policy.ts";
import {
  IdParamsSchema,
  InitializationResponseSchema,
  LatestVersionResponseSchema,
  ProjectInternalStatusSchema,
  UpdateProjectStatusSchema,
  VersionLockValidationSchema,
  UuidSchema,
  WriteVersionValidationSchema,
  plsModels,
} from "../schemas.ts";
const startProjectInitialization = async (
  scope: ProjectLogicScope,
  commands: import("../temporal/commands.ts").ProjectTemporalCommandsService,
  projectId: string,
) => {
  const project = await getProject(scope, projectId);
  if (project.isErr()) return project;
  const outcome = await commands.initializeProject({
    projectId,
    projectTypeId: project.value.projectTypeId,
    projectVersion: project.value.projectVersion,
  });
  if (outcome.disposition === "started") {
    await scope.transact(() =>
      scope.query((transaction) =>
        recordAuditEntry(transaction, {
          projectId,
          entityId: projectId,
          entityType: "project",
          changeType: "action",
          actionType: "project_initialization",
        }),
      ),
    );
  }
  return Result.ok({
    message:
      outcome.disposition === "started"
        ? `Project initialization workflow started for project '${projectId}'.`
        : `Workflow already started for project '${projectId}'.`,
    workflowStatus: outcome.workflowStatus,
  });
};

const ProjectListQuerySchema = T.Object({
  name: T.Optional(T.String()),
  status: T.Optional(T.Array(ProjectInternalStatusSchema)),
  search: T.Optional(T.String({ maxLength: 1_000 })),
  assignment: T.Optional(t.UnionEnum(["all", "mine"])),
  imported: T.Optional(t.BooleanString()),
  projectTypeName: T.Optional(t.ArrayQuery(T.String({ maxLength: 255 }))),
  statusName: T.Optional(t.ArrayQuery(T.String({ maxLength: 255 }))),
  ids: T.Optional(t.ArrayQuery(UuidSchema, { maxItems: 8 })),
  excludeIds: T.Optional(t.ArrayQuery(UuidSchema, { maxItems: 8 })),
  sort: T.Optional(
    t.UnionEnum([
      "name",
      "internalProjectNumber",
      "projectTypeName",
      "statusName",
      "originalCreatedAt",
      "updatedAt",
    ]),
  ),
  direction: T.Optional(t.UnionEnum(["asc", "desc"])),
  limit: t.Numeric({ minimum: 1, maximum: 200, multipleOf: 1, default: 50 }),
  offset: t.Numeric({ minimum: 0, multipleOf: 1, default: 0 }),
});

export const createProjectRoutes = <const App extends CoreRouteApp>(app: App) =>
  app
    .use(authentication)
    .use(plsModels)
    .model({
      LatestVersionResponse: LatestVersionResponseSchema,
      ProjectInitializationResponse: InitializationResponseSchema,
    })
    .get(
      "/projects",
      async ({ query, auth, postgres, projectConfiguration }) => {
        const accessible = await auth.listableProjectIds();
        if (accessible.isErr()) throw accessible.error;
        let accessibleIds: string[] | undefined = accessible.value;
        if (query.assignment === "mine") {
          if (!auth.user) return [];
          const assigned = await auth.assignedProjectIds();
          if (assigned.isErr()) throw assigned.error;
          if (accessibleIds === undefined) {
            accessibleIds = assigned.value;
          } else {
            const assignedIds = new Set(assigned.value);
            accessibleIds = accessibleIds.filter((id) => assignedIds.has(id));
          }
        }
        const result = await listProjects(postgres, {
          name: query.name,
          statuses: query.status,
          accessibleIds,
          projectCutOffDate: projectConfiguration.projectCutOffDate,
          search: query.search,
          projectTypeNames: query.projectTypeName,
          statusNames: query.statusName,
          imported: query.imported,
          ids: query.ids,
          excludeIds: query.excludeIds,
          sort: query.sort,
          direction: query.direction,
          limit: query.limit,
          offset: query.offset,
        });
        if (result.isErr()) throw result.error;
        return result.value.items;
      },
      {
        query: ProjectListQuerySchema,
        response: "ProjectListResponse",
        projectConfiguration: true,
        auth: projectListPolicy,
        detail: { operationId: "listProjects" },
      },
    )
    .get(
      "/projects/internal-number-availability",
      async ({ query, auth, postgres }) => {
        if (query.excludeProjectId !== undefined) {
          const readable = await auth.readProject(query.excludeProjectId);
          if (readable.isErr()) throw readable.error;
        }
        const accessible = await auth.listableProjectIds();
        if (accessible.isErr()) throw accessible.error;
        if (accessible.value?.length === 0) return { available: true };
        const exists = await postgres.query((database: ProjectLogicDatabase) =>
          projectLogicModels(database).projects.exists({
            where: and(
              eq(projects.isDeleted, false),
              eq(projects.projectVersion, activeProjectVersion(database)),
              accessible.value === undefined ? undefined : inArray(projects.id, accessible.value),
              eq(
                sql`lower(btrim(${projects.internalProjectNumber}))`,
                query.value.trim().toLocaleLowerCase(),
              ),
              query.excludeProjectId === undefined
                ? undefined
                : ne(projects.id, query.excludeProjectId),
            ),
          }),
        );
        return { available: !exists };
      },
      {
        query: T.Object(
          {
            value: T.String({ minLength: 1 }),
            excludeProjectId: T.Optional(UuidSchema),
          },
          { additionalProperties: false },
        ),
        response: T.Object({ available: T.Boolean() }),
        auth: projectCreatePolicy,
        detail: { operationId: "checkInternalProjectNumber" },
      },
    )
    .post(
      "/projects",
      async ({ body, auth, postgres }) => {
        const createdById = projectCreatorId(auth.user, body.createdById);
        if (!createdById) {
          throw projectErrors.INVALID_REQUEST({
            message: "Could not get user ID from headers or request body",
          });
        }
        return status(201, await createProject(postgres, { ...body, createdById }));
      },
      {
        body: "CreateProjectRequest",
        response: { 201: "ProjectResponse" },
        auth: projectCreatePolicy,
        detail: { operationId: "createProject" },
      },
    )
    .get("/projects/:projectId", ({ params, postgres }) => getProject(postgres, params.projectId), {
      params: IdParamsSchema,
      response: "ProjectResponse",
      detail: { operationId: "getProject" },
    })
    .patch(
      "/projects/:projectId",
      ({ params, body, postgres }) => updateProject(postgres, params.projectId, body),
      {
        params: IdParamsSchema,
        body: "UpdateProjectRequest",
        response: "ProjectResponse",
        auth: projectUpdatePolicy,
        detail: { operationId: "updateProject" },
      },
    )
    .patch(
      "/projects/:projectId/status",
      async ({ params, body, postgres }) => {
        const projectVersions = new ProjectVersions(postgres);
        const updated = await updateProjectStatusRecord(
          postgres,
          projectVersions,
          params.projectId,
          body.internalName,
        );
        if (updated.isErr()) throw updated.error;
        return getProject(postgres, params.projectId);
      },
      {
        params: IdParamsSchema,
        body: UpdateProjectStatusSchema,
        response: "ProjectResponse",
        auth: projectUpdatePolicy,
        detail: { operationId: "updateProjectStatus" },
      },
    )
    .delete(
      "/projects/:projectId",
      async ({ params, postgres, projectCommands }) => {
        const result = await removeProject(postgres, projectCommands, params.projectId);
        if (result.isErr()) throw result.error;
        return status(204);
      },
      {
        params: IdParamsSchema,
        response: { 204: t.Void() },
        projectCommands: true,
        auth: projectDeletePolicy,
        detail: { operationId: "deleteProject" },
      },
    )
    .post(
      "/projects/:projectId/initialize",
      ({ params, postgres, projectCommands }) =>
        startProjectInitialization(postgres, projectCommands, params.projectId),
      {
        params: IdParamsSchema,
        response: InitializationResponseSchema,
        projectCommands: true,
        auth: projectInitializePolicy,
        detail: { operationId: "initializeProject" },
      },
    )
    .get(
      "/projects/:projectId/latest-version",
      async ({ params, postgres }) => {
        const result = await getProject(postgres, params.projectId);
        if (result.isErr()) throw result.error;
        return { projectId: params.projectId, latestVersion: result.value.latestVersion };
      },
      {
        params: IdParamsSchema,
        response: LatestVersionResponseSchema,
        detail: { operationId: "getLatestProjectVersion" },
      },
    )
    .post(
      "/projects/:projectId/version-lock/validate",
      async ({ params, body, postgres }) => {
        await new ProjectVersions(postgres).validateLock({
          projectId: params.projectId,
          sourceVersion: body.sourceVersion,
          targetVersion: body.targetVersion,
          lockToken: body.lockToken,
        });
        return status(204);
      },
      {
        params: IdParamsSchema,
        body: VersionLockValidationSchema,
        response: { 204: t.Void() },
        detail: { operationId: "validateProjectVersionLock" },
      },
    )
    .post(
      "/projects/:projectId/version-lock/validate-write",
      async ({ params, body, postgres }) => ({
        projectId: params.projectId,
        latestVersion: await new ProjectVersions(postgres).ensureWritable(
          params.projectId,
          body.projectVersion,
        ),
      }),
      {
        params: IdParamsSchema,
        body: WriteVersionValidationSchema,
        response: LatestVersionResponseSchema,
        detail: { operationId: "validateProjectWriteVersion" },
      },
    );
