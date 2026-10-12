import type { FeatureHttp } from "@spark-workflow/http-host";
import {
  assertRestQuery,
  RestPaginationQueryProperties,
  RestQueryErrorSchema,
  parseRestPagination,
  restPageResponseSchema,
  restPaginationMetadata,
  resultOf,
  type RestPagination,
} from "@spark-workflow/http-host";
import { Type } from "@sinclair/typebox";
import { status, t } from "elysia";

import type { coreFeature } from "../../src/manifest.ts";
import { createUsecaseV2Routes } from "../../usecases/src/routes.ts";
import {
  projectCreatePolicy,
  projectDeletePolicy,
  projectListPolicy,
  projectUpdatePolicy,
  referenceMutationPolicy,
  referenceReadPolicy,
} from "./auth-policy.ts";
import { projectErrors } from "./errors.ts";
import { projectCreatorId } from "./project-creation.ts";
import {
  ApplicantResponseSchema,
  ApplicantIdParamsSchema,
  CreateProjectSchema,
  CreateProjectTypeSchema,
  IdParamsSchema,
  ProcessStepResponseSchema,
  ProcessStepIdParamsSchema,
  ProjectResponseSchema,
  ProjectStatusIdParamsSchema,
  ProjectStatusResponseSchema,
  ProjectTypeIdParamsSchema,
  ProjectTypeResponseSchema,
  UpdateProjectSchema,
  UpdateProjectTypeSchema,
  UuidSchema,
} from "./schemas.ts";
import { createNodeEntityResourceRoutes, projectEntities } from "./v2-entities.ts";

const CollectionQuerySchema = Type.Object(
  { ...RestPaginationQueryProperties },
  { additionalProperties: true },
);
const ProjectVersionSchema = t.Numeric({ minimum: 1, multipleOf: 1 });
const ProjectVersionCollectionQuerySchema = Type.Object(
  { projectVersion: ProjectVersionSchema, ...RestPaginationQueryProperties },
  { additionalProperties: true },
);
const ProjectVersionQuerySchema = Type.Object(
  { projectVersion: ProjectVersionSchema },
  { additionalProperties: true },
);
const ProcessStepCollectionQuerySchema = Type.Object(
  {
    projectTypeId: Type.Optional(UuidSchema),
    ...RestPaginationQueryProperties,
  },
  { additionalProperties: true },
);
const ProjectTypePatchSchema = Type.Partial(Type.Omit(UpdateProjectTypeSchema, ["id"]), {
  additionalProperties: false,
  minProperties: 1,
});

const pageRows = <Row extends { readonly id: string }>(
  rows: readonly Row[],
  pagination: RestPagination,
) => {
  const data = [...rows]
    .sort((left, right) => left.id.localeCompare(right.id))
    .slice(pagination.offset, pagination.offset + pagination.limit);
  return {
    data,
    pagination: restPaginationMetadata(pagination, data.length, rows.length),
  };
};

export function createProjectV2Routes(http: FeatureHttp<typeof coreFeature>) {
  const app = http
    .controller("core.projects.v2-routes")
    .get(
      "/projects",
      async ({ auth, projects, projectConfiguration, query, request }) => {
        const pagination = parseRestPagination(request, query);
        const accessible = await auth.listableProjectIds();
        if (accessible.isErr()) throw accessible.error;
        const result = await projects.list({
          accessibleIds: accessible.value,
          projectCutOffDate: projectConfiguration.projectCutOffDate,
          limit: pagination.limit,
          offset: pagination.offset,
          sort: "id",
          direction: "asc",
        });
        if (result.isErr()) throw result.error;
        return {
          data: result.value.items,
          pagination: restPaginationMetadata(
            pagination,
            result.value.items.length,
            result.value.total,
          ),
        };
      },
      {
        query: CollectionQuerySchema,
        response: {
          200: restPageResponseSchema(ProjectResponseSchema),
          400: RestQueryErrorSchema,
        },
        projectConfiguration: true,
        projects: true,
        auth: projectListPolicy,
        detail: { operationId: "v2ListProjects" },
      },
    )
    .post(
      "/projects",
      async ({ auth, body, projects, request }) => {
        assertRestQuery(request);
        const createdById = projectCreatorId(auth.user, body.createdById);
        if (!createdById) {
          throw projectErrors.INVALID_REQUEST({
            message: "Could not get user ID from headers or request body",
          });
        }
        return status(201, await projects.create({ ...body, createdById }));
      },
      {
        body: CreateProjectSchema,
        response: { 201: ProjectResponseSchema, 400: RestQueryErrorSchema },
        projects: true,
        auth: projectCreatePolicy,
        detail: { operationId: "v2CreateProject" },
      },
    )
    .get(
      "/projects/:projectId",
      async ({ params, projects, request }) => {
        assertRestQuery(request);
        return projects.get(params.projectId);
      },
      {
        params: IdParamsSchema,
        response: { 200: resultOf(ProjectResponseSchema), 400: RestQueryErrorSchema },
        projects: true,
        detail: { operationId: "v2GetProject" },
      },
    )
    .patch(
      "/projects/:projectId",
      async ({ params, body, projects, request }) => {
        assertRestQuery(request);
        return projects.update(params.projectId, body);
      },
      {
        params: IdParamsSchema,
        body: UpdateProjectSchema,
        response: { 200: resultOf(ProjectResponseSchema), 400: RestQueryErrorSchema },
        projects: true,
        auth: projectUpdatePolicy,
        detail: { operationId: "v2UpdateProject" },
      },
    )
    .delete(
      "/projects/:projectId",
      async ({ params, projects, projectCommands, request }) => {
        assertRestQuery(request);
        return projects.delete(projectCommands, params.projectId);
      },
      {
        params: IdParamsSchema,
        response: { 200: resultOf(ProjectResponseSchema), 400: RestQueryErrorSchema },
        projectCommands: true,
        projects: true,
        auth: projectDeletePolicy,
        detail: { operationId: "v2DeleteProject" },
      },
    )
    .get(
      "/projects/:projectId/applicants",
      async ({ applicants, params, query, request }) => {
        const pagination = parseRestPagination(request, query, [], ["projectVersion"]);
        return pageRows(await applicants.list(params.projectId, query.projectVersion), pagination);
      },
      {
        params: IdParamsSchema,
        query: ProjectVersionCollectionQuerySchema,
        response: {
          200: restPageResponseSchema(ApplicantResponseSchema),
          400: RestQueryErrorSchema,
        },
        applicants: true,
        detail: { operationId: "v2ListProjectApplicants" },
      },
    )
    .get(
      "/projects/:projectId/applicants/:applicantId",
      async ({ applicants, params, query, request }) => {
        assertRestQuery(request, { single: ["projectVersion"] });
        return applicants.findUnique(params.projectId, query.projectVersion, params.applicantId);
      },
      {
        params: ApplicantIdParamsSchema,
        query: ProjectVersionQuerySchema,
        response: { 200: ApplicantResponseSchema, 400: RestQueryErrorSchema },
        applicants: true,
        detail: { operationId: "v2GetProjectApplicant" },
      },
    )
    .get(
      "/project-types",
      async ({ projectTypes, query, request }) => {
        const pagination = parseRestPagination(request, query);
        return pageRows(await projectTypes.list(), pagination);
      },
      {
        query: CollectionQuerySchema,
        response: {
          200: restPageResponseSchema(ProjectTypeResponseSchema),
          400: RestQueryErrorSchema,
        },
        projectTypes: true,
        auth: referenceReadPolicy,
        detail: { operationId: "v2ListProjectTypes" },
      },
    )
    .post(
      "/project-types",
      async ({ body, projectTypes, request }) => {
        assertRestQuery(request);
        return status(201, await projectTypes.create(body));
      },
      {
        body: CreateProjectTypeSchema,
        response: { 201: ProjectTypeResponseSchema, 400: RestQueryErrorSchema },
        projectTypes: true,
        auth: referenceMutationPolicy,
        detail: { operationId: "v2CreateProjectType" },
      },
    )
    .get(
      "/project-types/:projectTypeId",
      async ({ params, projectTypes, request }) => {
        assertRestQuery(request);
        return projectTypes.findUnique(params.projectTypeId);
      },
      {
        params: ProjectTypeIdParamsSchema,
        response: { 200: ProjectTypeResponseSchema, 400: RestQueryErrorSchema },
        projectTypes: true,
        auth: referenceReadPolicy,
        detail: { operationId: "v2GetProjectType" },
      },
    )
    .patch(
      "/project-types/:projectTypeId",
      async ({ params, body, projectTypes, request }) => {
        assertRestQuery(request);
        return projectTypes.update(params.projectTypeId, body);
      },
      {
        params: ProjectTypeIdParamsSchema,
        body: ProjectTypePatchSchema,
        response: { 200: ProjectTypeResponseSchema, 400: RestQueryErrorSchema },
        projectTypes: true,
        auth: referenceMutationPolicy,
        detail: { operationId: "v2UpdateProjectType" },
      },
    )
    .delete(
      "/project-types/:projectTypeId",
      async ({ params, projectTypes, request }) => {
        assertRestQuery(request);
        return projectTypes.delete(params.projectTypeId);
      },
      {
        params: ProjectTypeIdParamsSchema,
        response: { 200: ProjectTypeResponseSchema, 400: RestQueryErrorSchema },
        projectTypes: true,
        auth: referenceMutationPolicy,
        detail: { operationId: "v2DeleteProjectType" },
      },
    )
    .get(
      "/project-statuses",
      async ({ projectStatuses, query, request }) => {
        const pagination = parseRestPagination(request, query);
        return pageRows(await projectStatuses.list(), pagination);
      },
      {
        query: CollectionQuerySchema,
        response: {
          200: restPageResponseSchema(ProjectStatusResponseSchema),
          400: RestQueryErrorSchema,
        },
        projectStatuses: true,
        auth: referenceReadPolicy,
        detail: { operationId: "v2ListProjectStatuses" },
      },
    )
    .get(
      "/project-statuses/:projectStatusId",
      async ({ params, projectStatuses, request }) => {
        assertRestQuery(request);
        return projectStatuses.findUnique(params.projectStatusId);
      },
      {
        params: ProjectStatusIdParamsSchema,
        response: { 200: ProjectStatusResponseSchema, 400: RestQueryErrorSchema },
        projectStatuses: true,
        auth: referenceReadPolicy,
        detail: { operationId: "v2GetProjectStatus" },
      },
    )
    .get(
      "/process-steps",
      async ({ processSteps, query, request }) => {
        const pagination = parseRestPagination(request, query, [], ["projectTypeId"]);
        return pageRows(await processSteps.list(query.projectTypeId), pagination);
      },
      {
        query: ProcessStepCollectionQuerySchema,
        response: {
          200: restPageResponseSchema(ProcessStepResponseSchema),
          400: RestQueryErrorSchema,
        },
        processSteps: true,
        auth: referenceReadPolicy,
        detail: { operationId: "v2ListProcessSteps" },
      },
    )
    .get(
      "/process-steps/:processStepId",
      async ({ params, processSteps, request }) => {
        assertRestQuery(request);
        return processSteps.findUnique(params.processStepId);
      },
      {
        params: ProcessStepIdParamsSchema,
        response: { 200: ProcessStepResponseSchema, 400: RestQueryErrorSchema },
        processSteps: true,
        auth: referenceReadPolicy,
        detail: { operationId: "v2GetProcessStep" },
      },
    );
  const usecases = app.guard({ usecases: true }, (guarded) =>
    createUsecaseV2Routes(guarded, ({ usecases }) => usecases),
  );
  return usecases.use(createNodeEntityResourceRoutes(http, projectEntities));
}
