import { authentication } from "@spark-workflow/authentification";
import { Type as T } from "@sinclair/typebox";
import { status, t } from "elysia";

import type { CoreRouteApp } from "../http.ts";
import {
  createProjectTypes,
  deleteProjectTypes,
  getProcessStep,
  listProcessSteps,
  listProjectStatuses,
  listProjectTypes,
  updateProjectTypes,
} from "../reference-data.ts";
import { referenceMutationPolicy, referenceReadPolicy } from "../auth-policy.ts";
import {
  CreateProjectTypeSchema,
  ProcessStepIdParamsSchema,
  ProcessStepResponseSchema,
  ProjectStatusResponseSchema,
  ProjectTypeResponseSchema,
  UpdateProjectTypeSchema,
  UuidSchema,
} from "../schemas.ts";

const ProcessStepQuerySchema = T.Object({ projectTypeId: T.Optional(UuidSchema) });
const DeleteProjectTypesQuerySchema = T.Object({ ids: T.Array(UuidSchema) });
export const createReferenceDataRoutes = <const App extends CoreRouteApp>(app: App) =>
  app
    .use(authentication)
    .model({
      ProjectStatusResponse: ProjectStatusResponseSchema,
      ProjectTypeResponse: ProjectTypeResponseSchema,
      ProcessStepResponse: ProcessStepResponseSchema,
    })
    .get("/project-statuses", ({ postgres }) => listProjectStatuses(postgres), {
      response: T.Array(ProjectStatusResponseSchema),
      auth: referenceReadPolicy,
      detail: { operationId: "listProjectStatuses" },
    })
    .get("/project-types", ({ postgres }) => listProjectTypes(postgres), {
      response: T.Array(ProjectTypeResponseSchema),
      auth: referenceReadPolicy,
      detail: { operationId: "listProjectTypes" },
    })
    .post(
      "/project-types",
      async ({ body, postgres }) => {
        return status(201, await createProjectTypes(postgres, body));
      },
      {
        body: T.Array(CreateProjectTypeSchema),
        response: { 201: T.Array(ProjectTypeResponseSchema) },
        auth: referenceMutationPolicy,
        detail: { operationId: "createProjectTypes" },
      },
    )
    .patch("/project-types", ({ body, postgres }) => updateProjectTypes(postgres, body), {
      body: T.Array(UpdateProjectTypeSchema),
      response: T.Array(ProjectTypeResponseSchema),
      auth: referenceMutationPolicy,
      detail: { operationId: "updateProjectTypes" },
    })
    .delete(
      "/project-types",
      async ({ query, postgres }) => {
        await deleteProjectTypes(postgres, query.ids);
        return status(204);
      },
      {
        query: DeleteProjectTypesQuerySchema,
        response: { 204: t.Void() },
        auth: referenceMutationPolicy,
        detail: { operationId: "deleteProjectTypes" },
      },
    )
    .get(
      "/process-steps",
      ({ query, postgres }) => listProcessSteps(postgres, query.projectTypeId),
      {
        query: ProcessStepQuerySchema,
        response: T.Array(ProcessStepResponseSchema),
        auth: referenceReadPolicy,
        detail: { operationId: "listProcessSteps" },
      },
    )
    .get(
      "/process-steps/:processStepId",
      ({ params, postgres }) => getProcessStep(postgres, params.processStepId),
      {
        params: ProcessStepIdParamsSchema,
        response: ProcessStepResponseSchema,
        auth: referenceReadPolicy,
        detail: { operationId: "getProcessStep" },
      },
    );
