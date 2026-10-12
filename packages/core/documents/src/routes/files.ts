import type { AnyElysia } from "elysia";

import { authenticatedPolicy, createProjectResourcePolicy } from "../auth-policy.ts";
import { publicConfirmResponse } from "../files/file-service.ts";
import {
  DownloadUrlResponseSchema,
  FileDownloadQuerySchema,
  FileListQuerySchema,
  FileParamsSchema,
  OptionalProjectVersionQuerySchema,
  PublicUploadRequestSchema,
  RequiredProjectVersionQuerySchema,
  UploadUrlResponseSchema,
} from "../schemas.ts";

export function createFileRoutes<const App extends AnyElysia>(app: App) {
  return app
    .model({
      UploadUrlResponse: UploadUrlResponseSchema,
      DownloadUrlResponse: DownloadUrlResponseSchema,
    })
    .group("/v2/files", (app) =>
      app
        .post(
          "/generate-upload-url",
          ({ body, query, documentRuntime }) =>
            documentRuntime.files.generateUploadUrl(body, query.projectVersion),
          {
            body: PublicUploadRequestSchema,
            query: OptionalProjectVersionQuerySchema,
            response: "UploadUrlResponse",
            auth: createProjectResourcePolicy,
            detail: { operationId: "generateFileUploadUrl" },
          },
        )
        .post(
          "/confirm-upload",
          async ({ body, query, documentRuntime }) => {
            const created = await documentRuntime.files.confirmUpload(
              body,
              query.projectVersion,
            );
            return publicConfirmResponse(created);
          },
          {
            body: PublicUploadRequestSchema,
            query: OptionalProjectVersionQuerySchema,
            response: "PublicConfirmResponse",
            auth: createProjectResourcePolicy,
            detail: { operationId: "confirmFileUpload" },
          },
        )
        .get(
          "",
          async ({ query, auth, documentRuntime }) => {
            const readable = await auth.readableProjectIds();
            if (readable.isErr()) throw readable.error;
            const topics =
              query.topicIds === undefined
                ? undefined
                : Array.isArray(query.topicIds)
                  ? query.topicIds
                  : [query.topicIds];
            return documentRuntime.files.listFiles({
              type: query.fileType,
              projectVersion: query.projectVersion,
              projectId: query.projectId,
              accessibleIds: readable.value,
              name: query.name,
              path: query.path,
              topicIds: topics,
              includeDeleted: query.includeDeleted,
              page: query.page,
              pageSize: query.pageSize,
            });
          },
          {
            query: FileListQuerySchema,
            response: "FileListResponse",
            auth: authenticatedPolicy,
            detail: { operationId: "listFiles" },
          },
        )
        .get(
          "/:fileId/versions",
          async ({ params, auth, documentRuntime }) => {
            const file = await documentRuntime.mutations.fileForAuthorization(
              params.fileId,
              undefined,
              true,
            );
            const readable = await auth.readProject(file.projectId);
            if (readable.isErr()) throw readable.error;
            return documentRuntime.files.getVersions(params.fileId);
          },
          {
            params: FileParamsSchema,
            response: "FileListResponse",
            auth: authenticatedPolicy,
            detail: { operationId: "getFileVersions" },
          },
        )
        .get(
          "/:fileId/generate-download-url",
          async ({ params, query, auth, documentRuntime }) => {
            const file = await documentRuntime.mutations.fileForAuthorization(
              params.fileId,
              query.projectVersion,
              query.includeDeleted ?? false,
            );
            const readable = await auth.readProject(file.projectId);
            if (readable.isErr()) throw readable.error;
            const result = await documentRuntime.files.downloadUrl(
              params.fileId,
              query.projectVersion,
              query.inline ?? false,
              query.includeDeleted ?? false,
            );
            return { downloadUrl: result.downloadUrl };
          },
          {
            params: FileParamsSchema,
            query: FileDownloadQuerySchema,
            response: "DownloadUrlResponse",
            auth: authenticatedPolicy,
            detail: { operationId: "generateFileDownloadUrl" },
          },
        )
        .get(
          "/:fileId",
          async ({ params, query, auth, documentRuntime }) => {
            const file = await documentRuntime.mutations.fileForAuthorization(
              params.fileId,
              query.projectVersion,
            );
            const readable = await auth.readProject(file.projectId);
            if (readable.isErr()) throw readable.error;
            return documentRuntime.files.getFile(params.fileId, query.projectVersion);
          },
          {
            params: FileParamsSchema,
            query: RequiredProjectVersionQuerySchema,
            response: "FileResponse",
            auth: authenticatedPolicy,
            detail: { operationId: "getFile" },
          },
        ),
    );
}
