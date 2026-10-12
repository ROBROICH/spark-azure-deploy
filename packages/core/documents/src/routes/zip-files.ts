import type { AnyElysia } from "elysia";

import { authenticatedPolicy } from "../auth-policy.ts";
import { notFound } from "../errors.ts";
import {
  OptionalProjectVersionQuerySchema,
  ZipListQuerySchema,
  ZipParamsSchema,
} from "../schemas.ts";

export function createZipFileRoutes<const App extends AnyElysia>(app: App) {
  return app.group("/v2/zip-files", (app) =>
    app
      .get(
        "",
        async ({ query, auth, documentRuntime }) => {
          const readable = await auth.readableProjectIds();
          if (readable.isErr()) throw readable.error;
          return documentRuntime.files.listZips({
            projectVersion: query.projectVersion,
            projectId: query.projectId,
            accessibleIds: readable.value,
            workflowStatus: query.workflowStatus,
            fileType: query.fileType,
            page: query.page,
            pageSize: query.pageSize,
          });
        },
        {
          query: ZipListQuerySchema,
          response: "ZipFileListResponse",
          auth: authenticatedPolicy,
          detail: { operationId: "listZipFiles" },
        },
      )
      .get(
        "/:zipFileId",
        async ({ params, query, auth, documentRuntime }) => {
          const zip = await documentRuntime.mutations.zipForAuthorization(params.zipFileId);
          if (!zip) throw notFound({ message: "Zip file not found" });
          const readable = await auth.readProject(zip.projectId);
          if (readable.isErr()) throw readable.error;
          return documentRuntime.files.getZip(params.zipFileId, query.projectVersion);
        },
        {
          params: ZipParamsSchema,
          query: OptionalProjectVersionQuerySchema,
          response: "ZipFileResponse",
          auth: authenticatedPolicy,
          detail: { operationId: "getZipFile" },
        },
      ),
  );
}
