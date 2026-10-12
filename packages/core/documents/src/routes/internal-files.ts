import type { AnyElysia } from "elysia";

import { serviceOnlyPolicy } from "../auth-policy.ts";
import { dmsErrors } from "../errors.ts";
import { fileResponse, zipFileResponse } from "../files/file-service.ts";
import {
  DownloadUrlResponseSchema,
  FileDownloadQuerySchema,
  InternalFileParamsSchema,
  OptionalProjectVersionQuerySchema,
  UploadRequestSchema,
  UploadUrlResponseSchema,
} from "../schemas.ts";

export function createInternalFileRoutes<const App extends AnyElysia>(app: App) {
  return app
    .model({
      UploadUrlResponse: UploadUrlResponseSchema,
      DownloadUrlResponse: DownloadUrlResponseSchema,
    })
    .group("/v2/internal/files", (app) =>
      app
        .onBeforeHandle(({ request }) => {
          if (request.headers.has("authorization")) throw dmsErrors.INTERNAL_ENDPOINT();
        })
        .post(
          "/generate-upload-url",
          ({ body, query, documentRuntime }) =>
            documentRuntime.files.generateUploadUrl(body, query.projectVersion, { internal: true }),
          {
            body: UploadRequestSchema,
            query: OptionalProjectVersionQuerySchema,
            response: "UploadUrlResponse",
            auth: serviceOnlyPolicy,
            detail: { operationId: "generateInternalFileUploadUrl" },
          },
        )
        .get(
          "/:id/generate-download-url",
          async ({ params: { id: fileId }, query, documentRuntime }) => {
            const result = await documentRuntime.files.downloadUrl(
              fileId,
              query.projectVersion,
              query.inline ?? false,
              query.includeDeleted ?? false,
              { internal: true },
            );
            return { downloadUrl: result.downloadUrl };
          },
          {
            params: InternalFileParamsSchema,
            query: FileDownloadQuerySchema,
            response: "DownloadUrlResponse",
            auth: serviceOnlyPolicy,
            detail: { operationId: "generateInternalFileDownloadUrl" },
          },
        )
        .post(
          "/confirm-upload",
          async ({ body, query, documentRuntime }) => {
            const created = await documentRuntime.files.confirmUpload(body, query.projectVersion);
            return "mimeType" in created ? fileResponse(created) : zipFileResponse(created);
          },
          {
            body: UploadRequestSchema,
            query: OptionalProjectVersionQuerySchema,
            response: "PublicConfirmResponse",
            auth: serviceOnlyPolicy,
            detail: { operationId: "confirmInternalFileUpload" },
          },
        ),
    );
}
