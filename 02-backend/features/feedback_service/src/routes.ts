import type { AuthPolicy } from "@spark-workflow/authentification";
import type { FeatureHttp } from "@spark-workflow/http-host";
import {
  batchNodes,
  buildNodeContracts,
  copyProjectVersionNodes,
  executeNodeMutation,
  listNodes,
  nodeDefinition,
  nodeTypeLiteral,
  undoProjectVersionNodes,
  type CopyVersionNodeInput,
  type NodeBase,
  type NodeMutationInput,
} from "@spark-workflow/node-crud";
import type { PostgresScope } from "@spark-workflow/postgres-runtime";
import { Type as T, type TSchema } from "@sinclair/typebox";
import { better } from "better-drizzle";
import { t } from "elysia";

import { feedbackSchema } from "./db/schema";
import type { feature } from "./manifest.ts";
import {
  feedbackDescriptor,
  FeedbackRatingSchema,
} from "./node.ts";

const contracts = buildNodeContracts(feedbackDescriptor);
const feedbackNode = nodeDefinition(feedbackDescriptor, "feedback");
const FeedbackNodeType = nodeTypeLiteral("feedback");
const FeedbackPatch = T.Omit(feedbackNode.schemas.patch, ["userId"], {
  additionalProperties: false,
});
const CopyOverrides = T.Omit(feedbackNode.schemas.patch, ["userId", "isOutdated"], {
  additionalProperties: false,
});
const FeedbackNodeResponse = T.Object(
  {
    nodeType: FeedbackNodeType,
    ...feedbackNode.schemas.response.properties,
    sysPeriod: T.String(),
  },
  { additionalProperties: false },
);
const MutationBody = T.Object(
  {
    inserts: T.Optional(
      T.Array(
        T.Object(
          {
            nodeType: FeedbackNodeType,
            id: T.Optional(T.String({ format: "uuid" })),
            payload: feedbackNode.schemas.insert,
          },
          { additionalProperties: false },
        ),
      ),
    ),
    updates: T.Optional(
      T.Array(
        T.Object(
          { nodeType: FeedbackNodeType, id: T.String({ format: "uuid" }), payload: FeedbackPatch },
          { additionalProperties: false },
        ),
      ),
    ),
    deletes: T.Optional(T.Array(contracts.nodeRef)),
  },
  { additionalProperties: false },
);
const CopyBody = T.Object(
  {
    sourceVersion: T.Integer({ minimum: 1 }),
    targetVersion: T.Integer({ minimum: 1 }),
    lockToken: T.String({ minLength: 1 }),
    dryRun: T.Boolean(),
    nodes: T.Optional(
      T.Array(
        T.Object(
          {
            nodeType: FeedbackNodeType,
            id: T.String({ format: "uuid" }),
            setOutdated: T.Optional(T.Boolean()),
            overrides: T.Optional(CopyOverrides),
          },
          { additionalProperties: false },
        ),
      ),
    ),
  },
  { additionalProperties: false },
);
const UndoBody = T.Object(
  { targetVersion: T.Integer({ minimum: 1 }), lockToken: T.String({ minLength: 1 }) },
  { additionalProperties: false },
);
const BatchGetNodesResponse = T.Object(
  { results: T.Array(FeedbackNodeResponse) },
  { additionalProperties: false },
);
const ProcessNodeChangesResponse = T.Object(
  {
    inserted: T.Array(FeedbackNodeResponse),
    updated: T.Array(FeedbackNodeResponse),
    deleted: T.Array(contracts.nodeRef),
  },
  { additionalProperties: false },
);
const CopyVersionResponse = T.Object(
  { dryRun: T.Boolean(), copied: T.Integer() },
  { additionalProperties: false },
);
const UndoVersionResponse = T.Object(
  { deleted: T.Object({ feedback: T.Integer() }, { additionalProperties: false }) },
  { additionalProperties: false },
);
const Params = T.Object(
  { projectId: T.String({ format: "uuid" }) },
  { additionalProperties: false },
);
const WriteQuery = T.Object(
  { projectVersion: t.Numeric({ minimum: 1 }) },
  { additionalProperties: false },
);
const updatePolicy = {
  roles: ["admin", "user", "service"],
  permissions: [{ resource: "project", permission: "update", path: "projectId" }],
  bypassRoles: ["admin", "service"],
} satisfies AuthPolicy;

async function withSystemPeriods(
  postgres: PostgresScope<typeof feedbackSchema>,
  projectId: string,
  projectVersion: number,
  nodes: readonly NodeBase[],
) {
  if (nodes.length === 0) return [];
  const periods = await postgres.query((transaction) =>
    better(transaction, { schema: feedbackSchema }).feedback.findMany({
      where: {
        id: { in: nodes.map(({ id }) => id) },
        projectId,
        projectVersion,
        isDeleted: false,
      },
      select: { id: true, sysPeriod: true },
    }),
  );
  const periodsById = new Map(periods.map(({ id, sysPeriod }) => [id, sysPeriod]));
  return nodes.flatMap((node) => {
    const sysPeriod = periodsById.get(node.id);
    return sysPeriod === undefined ? [] : [{ ...node, sysPeriod }];
  });
}

export const createRoutes = (http: FeatureHttp<typeof feature>) =>
  http
    .controller("feedback-service.routes")
    .model({
      V1FeedbackNodeRef: contracts.nodeRef,
      V1FeedbackParentRef: contracts.parentRef,
      V1FeedbackNodeSummary: contracts.nodeSummary,
      V1FeedbackNodesListResponse: contracts.listResponse,
      V1FeedbackBatchGetNodesRequest: contracts.batchRequest,
      V1FeedbackBatchGetNodesResponse: BatchGetNodesResponse,
      V1FeedbackProcessNodeChangesRequest: MutationBody,
      V1FeedbackProcessNodeChangesResponse: ProcessNodeChangesResponse,
      V1FeedbackCopyVersionRequest: CopyBody,
      V1FeedbackCopyVersionResponse: CopyVersionResponse,
      V1FeedbackUndoVersionRequest: UndoBody,
      V1FeedbackUndoVersionResponse: UndoVersionResponse,
      V1FeedbackNodeResponse: FeedbackNodeResponse,
      V1FeedbackRating: FeedbackRatingSchema,
    })
    .group("/:projectId", (app) =>
      app
        .get(
          "/nodes",
          async ({ params, nodes, projectVersion, request }) => {
            return listNodes(
              nodes,
              params.projectId,
              projectVersion,
              request.signal,
            );
          },
          {
            params: Params,
            response: t.Ref("V1FeedbackNodesListResponse"),
            nodes: true,
            projectVersion: true,
            detail: { operationId: "v1FeedbackListNodes" },
          },
        )
        .post(
          "/batch-nodes",
          async ({ params, body, postgres, nodes, projectVersion }) => {
            const { results } = await batchNodes(
              nodes,
              params.projectId,
              projectVersion,
              body.nodes,
            );
            return {
              results: await withSystemPeriods(postgres, params.projectId, projectVersion, results),
            };
          },
          {
            params: Params,
            body: contracts.batchRequest,
            response: t.Ref("V1FeedbackBatchGetNodesResponse") as TSchema,
            nodes: true,
            projectVersion: true,
            detail: { operationId: "v1FeedbackBatchGetNodes" },
          },
        )
        .post(
          "/update",
          async ({ auth, params, query, body, postgres, nodes }) => {
            const input = body as NodeMutationInput;
            return postgres.transact(async () => {
              const mutation = await executeNodeMutation(
                nodes,
                auth,
                params.projectId,
                query.projectVersion,
                {
                  ...input,
                  inserts: input.inserts?.map((insert) => ({
                    ...insert,
                    payload: {
                      ...insert.payload,
                      userId: auth.user?.sub ?? insert.payload.userId,
                    },
                  })),
                },
              );
              if (mutation.isErr()) throw mutation.error;
              return {
                inserted: await withSystemPeriods(
                  postgres,
                  params.projectId,
                  query.projectVersion,
                  mutation.value.inserted,
                ),
                updated: await withSystemPeriods(
                  postgres,
                  params.projectId,
                  query.projectVersion,
                  mutation.value.updated,
                ),
                deleted: mutation.value.deleted.map(({ nodeType, id }) => ({ nodeType, id })),
              };
            });
          },
          {
            params: Params,
            query: WriteQuery,
            body: MutationBody,
            response: t.Ref("V1FeedbackProcessNodeChangesResponse") as TSchema,
            auth: updatePolicy,
            nodes: true,
            detail: { operationId: "v1FeedbackUpdateNodes" },
          },
        )
        .post(
          "/copy-version",
          async ({ params, body, nodes }) => {
            const result = await copyProjectVersionNodes({
              descriptor: nodes,
              projectId: params.projectId,
              sourceVersion: body.sourceVersion,
              targetVersion: body.targetVersion,
              lockToken: body.lockToken,
              nodes: (body.nodes ?? []) as CopyVersionNodeInput[],
              dryRun: body.dryRun,
            });
            if (result.isErr()) throw result.error;
            return { dryRun: body.dryRun, copied: result.value.copied };
          },
          {
            params: Params,
            body: CopyBody,
            response: t.Ref("V1FeedbackCopyVersionResponse"),
            auth: updatePolicy,
            nodes: true,
            detail: { operationId: "v1FeedbackCopyVersionNodes" },
          },
        )
        .post(
          "/undo-version",
          async ({ params, body, nodes }) => {
            const { deleted } = await undoProjectVersionNodes({
              descriptor: nodes,
              projectId: params.projectId,
              targetVersion: body.targetVersion,
              lockToken: body.lockToken,
            });
            return { deleted: { feedback: deleted.feedback ?? 0 } };
          },
          {
            params: Params,
            body: UndoBody,
            response: t.Ref("V1FeedbackUndoVersionResponse"),
            auth: updatePolicy,
            nodes: true,
            detail: { operationId: "v1FeedbackUndoVersionNodes" },
          },
        ),
    );
