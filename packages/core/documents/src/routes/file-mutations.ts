import type { AnyElysia } from "elysia";

import { authenticatedPolicy, createProjectResourcePolicy } from "../auth-policy.ts";
import { notFound } from "../errors.ts";
import {
  FileParamsSchema,
  FileUpdateRequestSchema,
  RequiredProjectVersionQuerySchema,
  StartFileProcessingRequestSchema,
} from "../schemas.ts";

export function createFileMutationRoutes<const App extends AnyElysia>(app: App) {
  return app.group("/v2/files", (app) =>
    app
      .patch(
        "/:fileId",
        async ({ params, query, body, auth, documentRuntime }) => {
          const file = await documentRuntime.mutations.fileForAuthorization(
            params.fileId,
            query.projectVersion,
          );
          if (!file.projectId) throw notFound({ message: "File not found" });
          const authorization = await auth.authorize(
            [{ resource: "project", resourceId: file.projectId, permission: "update" }],
            { bypassRoles: ["admin", "service"] },
          );
          if (authorization.isErr()) throw authorization.error;
          return documentRuntime.mutations.updateFile(params.fileId, query.projectVersion, body);
        },
        {
          params: FileParamsSchema,
          query: RequiredProjectVersionQuerySchema,
          body: FileUpdateRequestSchema,
          response: "FileResponse",
          auth: authenticatedPolicy,
          detail: { operationId: "updateFile" },
        },
      )
      .delete(
        "/:fileId",
        async ({ params, query, auth, documentRuntime }) => {
          const file = await documentRuntime.mutations.fileForAuthorization(
            params.fileId,
            query.projectVersion,
          );
          if (!file.projectId) throw notFound({ message: "File not found" });
          const authorization = await auth.authorize(
            [{ resource: "project", resourceId: file.projectId, permission: "delete" }],
            { bypassRoles: ["admin", "service"] },
          );
          if (authorization.isErr()) throw authorization.error;
          return documentRuntime.mutations.deleteFile(params.fileId, query.projectVersion);
        },
        {
          params: FileParamsSchema,
          query: RequiredProjectVersionQuerySchema,
          response: "FileResponse",
          auth: authenticatedPolicy,
          detail: { operationId: "deleteFile" },
        },
      )
      .post(
        "/start-file-processing",
        ({ body, documentRuntime }) => documentRuntime.mutations.startFileProcessing(body),
        {
          body: StartFileProcessingRequestSchema,
          response: "StartFileProcessingResponse",
          auth: createProjectResourcePolicy,
          detail: { operationId: "startFileProcessing" },
        },
      ),
  );
}
