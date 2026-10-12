import type { AuthPolicy } from "@spark-workflow/authentification";
import { Type } from "@sinclair/typebox";
import { type AnyElysia, status as httpStatus, t } from "elysia";

const errorBody = (error: { status: number; message: string }) =>
  httpStatus(error.status, { detail: error.message });

import { buildNodeContracts, nodeOperationId } from "./contracts";
import type { NodeDescriptor, NodeRuntime, NodeSchema } from "./descriptor";
import { batchNodes, listNodes, mutateNodes } from "./service";

type RuntimeContext<App extends AnyElysia> = App["~Singleton"]["decorator"] &
  App["~Singleton"]["derive"] &
  App["~Singleton"]["resolve"] &
  App["~Ephemeral"]["derive"] &
  App["~Ephemeral"]["resolve"] &
  App["~Volatile"]["derive"] &
  App["~Volatile"]["resolve"];

export type NodeRuntimeResolver<App extends AnyElysia, Schema extends NodeSchema> = (
  context: RuntimeContext<App>,
) => NodeRuntime<Schema> | Promise<NodeRuntime<Schema>>;

const projectParams = Type.Object(
  { projectId: Type.String({ format: "uuid" }) },
  { additionalProperties: false },
);

const readQuery = Type.Object(
  { projectVersion: Type.Optional(t.Numeric()) },
  { additionalProperties: false },
);

const writeQuery = Type.Object(
  { projectVersion: t.Numeric({ minimum: 1 }) },
  { additionalProperties: false },
);

const nodeWritePolicy = (permission: "create" | "update" | "delete") =>
  ({
    roles: ["admin", "user", "service"],
    permissions: [{ resource: "project", permission, path: "projectId" }],
    bypassRoles: ["admin", "service"],
  }) satisfies AuthPolicy;

export const nodeCreatePolicy = nodeWritePolicy("create");
export const nodeUpdatePolicy = nodeWritePolicy("update");
export const nodeDeletePolicy = nodeWritePolicy("delete");

export function createNodeRoutes<const App extends AnyElysia, Schema extends NodeSchema>(
  app: App,
  descriptor: NodeDescriptor,
  resolveRuntime: NodeRuntimeResolver<App, Schema>,
  options: Readonly<{ addUpdateEndpoint?: boolean }> = {},
) {
  const contracts = buildNodeContracts(descriptor);
  return app.model(contracts.openApiModels).group("/:projectId", (app) => {
    const routes = app
      .get(
        "/nodes",
        async (context) => {
          const { params, query } = context;
          const runtime = await resolveRuntime(context);
          if (query.projectVersion !== undefined) {
            return listNodes(
              runtime,
              params.projectId,
              query.projectVersion,
              context.request.signal,
            );
          }
          const version = await runtime.versionPeer.resolveLatestVersion(params.projectId);
          return version.isErr()
            ? errorBody(version.error)
            : listNodes(runtime, params.projectId, version.value, context.request.signal);
        },
        {
          params: projectParams,
          query: readQuery,
          response: t.Ref(contracts.modelNames.listResponse),
          detail: { operationId: nodeOperationId(descriptor, "ListNodes") },
        },
      )
      .post(
        "/batch-nodes",
        async (context) => {
          const { params, query, body } = context;
          const runtime = await resolveRuntime(context);
          const nodes = body.nodes;
          if (query.projectVersion !== undefined) {
            return batchNodes(runtime, params.projectId, query.projectVersion, nodes);
          }
          const version = await runtime.versionPeer.resolveLatestVersion(params.projectId);
          return version.isErr()
            ? errorBody(version.error)
            : batchNodes(runtime, params.projectId, version.value, nodes);
        },
        {
          params: projectParams,
          query: readQuery,
          body: contracts.batchRequest,
          response: t.Ref(contracts.modelNames.batchResponse),
          detail: { operationId: nodeOperationId(descriptor, "BatchGetNodes") },
        },
      );

    if (options.addUpdateEndpoint === false) return routes;

    return routes.post(
      "/update",
      async (context) => {
        const { params, query, body, auth } = context;
        const runtime = await resolveRuntime(context);
        const result = await mutateNodes(
          runtime,
          auth,
          params.projectId,
          query.projectVersion,
          body,
        );
        return result.isErr() ? errorBody(result.error) : result.value;
      },
      {
        params: projectParams,
        query: writeQuery,
        body: contracts.mutationRequest,
        response: t.Ref(contracts.modelNames.mutationResponse),
        auth: nodeUpdatePolicy,
        detail: { operationId: nodeOperationId(descriptor, "UpdateNodes") },
      },
    );
  });
}
