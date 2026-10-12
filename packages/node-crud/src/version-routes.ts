import type { AuthPolicy } from "@spark-workflow/authentification";
import { Type } from "@sinclair/typebox";
import { type AnyElysia, status, t } from "elysia";
import { EvlogError } from "evlog";

const errorBody = (error: { status: number; message: string }) =>
  status(error.status, { detail: error.message });

import type { NodeDescriptor, NodeSchema } from "./descriptor";
import { nodeOperationId } from "./contracts";
import { buildNodeVersionContracts } from "./version-contracts";
import { copyProjectVersionNodes, undoProjectVersionNodes } from "./version-operations";
import type { NodeRuntimeResolver } from "./routes";

const projectParams = Type.Object(
  { projectId: Type.String({ format: "uuid" }) },
  { additionalProperties: false },
);

const updatePolicy = {
  roles: ["admin", "user", "service"],
  permissions: [
    {
      resource: "project",
      permission: "update",
      path: "projectId",
    },
  ],
  bypassRoles: ["admin", "service"],
} satisfies AuthPolicy;

export function createNodeVersionRoutes<const App extends AnyElysia, Schema extends NodeSchema>(
  app: App,
  descriptor: NodeDescriptor,
  resolveRuntime: NodeRuntimeResolver<App, Schema>,
) {
  const contracts = buildNodeVersionContracts(descriptor);

  return app.model(contracts.openApiModels).group("/:projectId", (app) =>
    app
      .post(
        "/copy-version",
        async (context) => {
          const { params, body } = context;
          const runtime = await resolveRuntime(context);
          const result = await copyProjectVersionNodes({
            descriptor: runtime,
            projectId: params.projectId,
            sourceVersion: body.sourceVersion,
            targetVersion: body.targetVersion,
            lockToken: body.lockToken,
            nodes: body.nodes ?? [],
            dryRun: body.dryRun,
          });
          return result.isErr()
            ? errorBody(result.error)
            : { dryRun: body.dryRun, copied: result.value.copied };
        },
        {
          params: projectParams,
          body: contracts.copyRequest,
          response: t.Ref(contracts.modelNames.copyResponse),
          auth: updatePolicy,
          detail: { operationId: nodeOperationId(descriptor, "CopyVersionNodes") },
        },
      )
      .post(
        "/undo-version",
        async (context) => {
          const { params, body } = context;
          const runtime = await resolveRuntime(context);
          try {
            return await undoProjectVersionNodes({
              descriptor: runtime,
              projectId: params.projectId,
              targetVersion: body.targetVersion,
              lockToken: body.lockToken,
            });
          } catch (cause) {
            if (EvlogError.isEvlogError(cause)) return errorBody(cause);
            throw cause;
          }
        },
        {
          params: projectParams,
          body: contracts.undoRequest,
          response: t.Ref(contracts.modelNames.undoResponse),
          auth: updatePolicy,
          detail: { operationId: nodeOperationId(descriptor, "UndoVersionNodes") },
        },
      ),
  );
}
