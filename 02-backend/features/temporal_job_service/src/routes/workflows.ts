import type { AuthPolicy } from "@spark-workflow/authentification";
import { resultOf, type FeatureHttp } from "@spark-workflow/http-host";
import { TemporalFixtureDeclaredError } from "@spark-temporal/typescript/caller";
import { WorkflowNotFoundError } from "@temporalio/common";
import { Type as T, type TSchema } from "@sinclair/typebox";
import { Result } from "better-result";
import { t } from "elysia";
import { EvlogError } from "evlog";

import { temporalJobErrors } from "../errors.ts";
import { withStoredFailures } from "../workflow-failure.ts";
import type { feature } from "../manifest.ts";
import {
  getExecutionTree,
  getWorkflow,
  getWorkflowProject,
  listWorkflows,
  listWorkflowsByType,
} from "../temporal/queries.ts";
import {
  ExecutionTreeNodeSchema,
  ExecutionStatusSchema,
  ExecutionTreeResponseSchema,
  TemporalStatusSchema,
  PageTokenSchema,
  UuidSchema,
  WorkflowIdSchema,
  WorkflowIdsOptions,
  WorkflowResponseSchema,
  WorkflowResultSchema,
  WorkflowsByTypeResponseSchema,
  WorkflowsResponseSchema,
  WorkflowSummarySchema,
  type WorkflowReadInput,
} from "../schemas.ts";

const PaginationQuery = {
  pageSize: T.Optional(t.Numeric({ minimum: 1, maximum: 100, multipleOf: 1 })),
  nextPageToken: T.Optional(PageTokenSchema),
};

const ListQuerySchema = T.Object(
  {
    executionStatus: T.Optional(ExecutionStatusSchema),
    projectId: UuidSchema,
    projectVersion: T.Optional(t.Numeric({ minimum: 1, multipleOf: 1 })),
    workflowId: T.Optional(WorkflowIdSchema),
    ...PaginationQuery,
  },
  { additionalProperties: false },
);

const workflowDetailPolicy = {
  roles: ["admin", "user", "service"],
} satisfies AuthPolicy;

function workflowReadError(workflowId: string, cause: unknown) {
  if (EvlogError.isEvlogError(cause)) return cause;
  return cause instanceof WorkflowNotFoundError ||
    (cause instanceof TemporalFixtureDeclaredError && cause.code === "NOT_FOUND")
    ? temporalJobErrors.WORKFLOW_NOT_FOUND({
        message: `Workflow does not exist: ${workflowId}`,
        cause,
      })
    : temporalJobErrors.WORKFLOW_READ_FAILED({
        cause: cause instanceof Error ? cause : undefined,
      });
}

const WorkflowParamsSchema = T.Object(
  { workflowId: T.String({ minLength: 1 }) },
  { additionalProperties: false },
);

const WorkflowQuerySchema = T.Object(
  { runId: T.Optional(T.String({ minLength: 1 })) },
  { additionalProperties: false },
);

const TreeQuerySchema = T.Object(
  { ...WorkflowQuerySchema.properties, ...PaginationQuery },
  { additionalProperties: false },
);

const ByTypeParamsSchema = T.Object({ projectId: UuidSchema }, { additionalProperties: false });

const ByTypeQuerySchema = T.Object(
  {
    workflowType: T.String({
      minLength: 1,
      pattern: "^[A-Za-z0-9_.:-]+$",
    }),
    workflowId: T.Optional(WorkflowIdSchema),
    workflowIds: T.Optional(t.ArrayQuery(WorkflowIdSchema, WorkflowIdsOptions)),
    rootWorkflowId: T.Optional(WorkflowIdSchema),
    rootRunId: T.Optional(UuidSchema),
    executionStatus: T.Optional(ExecutionStatusSchema),
    projectVersion: T.Optional(t.Numeric({ minimum: 1, multipleOf: 1 })),
    ...PaginationQuery,
  },
  { additionalProperties: false },
);

export const createWorkflowRoutes = (http: FeatureHttp<typeof feature>) =>
  http
    .controller("temporal-job-service.routes.workflows")
    .model({
      WorkflowsBase: WorkflowSummarySchema,
      TemporalStatus: TemporalStatusSchema,
      TemporalJobExecutionTreeNode: ExecutionTreeNodeSchema,
      TemporalJobWorkflowResult: WorkflowResultSchema,
      TemporalJobExecutionTree: ExecutionTreeResponseSchema,
      GetWorkflowResponse: WorkflowResponseSchema,
      WorkflowsResponse: WorkflowsResponseSchema,
      WorkflowsByTypeResponse: WorkflowsByTypeResponseSchema,
    })
    .get(
      "/temporal/workflows",
      async ({ query, auth, temporalWorkflows, postgres }) => {
        const readable = await auth.readProject(query.projectId);
        if (readable.isErr()) throw readable.error;
        const result = await Result.tryPromise({
          try: () =>
            listWorkflows(temporalWorkflows, {
              executionStatus: query.executionStatus ?? "all",
              projectId: query.projectId,
              projectVersion: query.projectVersion ?? null,
              pageSize: query.pageSize ?? 100,
              nextPageToken: query.nextPageToken ?? null,
              workflowId: query.workflowId,
            }),
          catch: (cause) =>
            EvlogError.isEvlogError(cause)
              ? cause
              : temporalJobErrors.WORKFLOW_READ_FAILED({
                  cause: cause instanceof Error ? cause : undefined,
                }),
        });
        if (result.isErr()) throw result.error;
        return {
          ...result.value,
          workflows: await withStoredFailures(postgres, result.value.workflows),
        };
      },
      {
        query: ListQuerySchema,
        response: WorkflowsResponseSchema as TSchema,
        temporalWorkflows: true,
        detail: { operationId: "listTemporalWorkflows" },
      },
    )
    .get(
      "/temporal/workflows/by-type/:projectId",
      async ({ params, query, temporalWorkflows, postgres }) => {
        const result = await Result.tryPromise({
          try: () =>
            listWorkflowsByType(temporalWorkflows, {
              projectId: params.projectId,
              workflowType: query.workflowType,
              executionStatus: query.executionStatus ?? "all",
              workflowId: query.workflowId,
              workflowIds: query.workflowIds,
              rootWorkflowId: query.rootWorkflowId,
              rootRunId: query.rootRunId,
              projectVersion: query.projectVersion ?? null,
              pageSize: query.pageSize ?? 100,
              nextPageToken: query.nextPageToken ?? null,
            }),
          catch: (cause) =>
            EvlogError.isEvlogError(cause)
              ? cause
              : temporalJobErrors.WORKFLOW_READ_FAILED({
                  cause: cause instanceof Error ? cause : undefined,
                }),
        });
        if (result.isErr()) throw result.error;
        return {
          ...result.value,
          workflows: await withStoredFailures(postgres, result.value.workflows),
        };
      },
      {
        params: ByTypeParamsSchema,
        query: ByTypeQuerySchema,
        response: WorkflowsByTypeResponseSchema as TSchema,
        temporalWorkflows: true,
        detail: { operationId: "listTemporalWorkflowsByType" },
      },
    )
    .get(
      "/temporal/workflows/:workflowId",
      async ({ params, query, auth, temporalWorkflows }) => {
        const input: WorkflowReadInput = { workflowId: params.workflowId };
        if (query.runId !== undefined) input.runId = query.runId;
        if (query.includeResult !== undefined) input.includeResult = query.includeResult;
        if (!auth.readsEveryProject) {
          const project = await Result.tryPromise({
            try: () => getWorkflowProject(temporalWorkflows, input),
            catch: (cause) => workflowReadError(params.workflowId, cause),
          });
          if (project.isErr()) throw project.error;
          const readable = await auth.readProject(project.value.projectId);
          if (readable.isErr()) throw readable.error;
          input.runId = project.value.runId;
        }
        return Result.tryPromise({
          try: () => getWorkflow(temporalWorkflows, input),
          catch: (cause) => workflowReadError(params.workflowId, cause),
        });
      },
      {
        params: WorkflowParamsSchema,
        query: T.Object(
          {
            ...WorkflowQuerySchema.properties,
            includeResult: T.Optional(t.BooleanString()),
          },
          { additionalProperties: false },
        ),
        response: WorkflowResponseSchema as TSchema,
        auth: workflowDetailPolicy,
        temporalWorkflows: true,
        detail: { operationId: "getTemporalWorkflow" },
      },
    )
    .get(
      "/temporal/workflows/:workflowId/execution-tree",
      async ({ params, query, auth, temporalWorkflows }) => {
        if (query.nextPageToken !== undefined && query.runId === undefined) {
          throw temporalJobErrors.INVALID_CONTINUATION();
        }
        const input: WorkflowReadInput = { workflowId: params.workflowId };
        if (query.runId !== undefined) input.runId = query.runId;
        if (!auth.readsEveryProject) {
          const project = await Result.tryPromise({
            try: () => getWorkflowProject(temporalWorkflows, input),
            catch: (cause) => workflowReadError(params.workflowId, cause),
          });
          if (project.isErr()) throw project.error;
          const readable = await auth.readProject(project.value.projectId);
          if (readable.isErr()) throw readable.error;
          input.runId = project.value.runId;
        }
        return Result.tryPromise({
          try: () =>
            getExecutionTree(temporalWorkflows, {
              ...input,
              pageSize: query.pageSize ?? 100,
              nextPageToken: query.nextPageToken ?? null,
            }),
          catch: (cause) =>
            EvlogError.isEvlogError(cause)
              ? cause
              : temporalJobErrors.EXECUTION_TREE_FAILED({
                  cause: cause instanceof Error ? cause : undefined,
                }),
        });
      },
      {
        params: WorkflowParamsSchema,
        query: TreeQuerySchema,
        response: resultOf(ExecutionTreeResponseSchema),
        auth: workflowDetailPolicy,
        temporalWorkflows: true,
        detail: { operationId: "getTemporalWorkflowExecutionTree" },
      },
    );
