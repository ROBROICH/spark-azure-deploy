import type { AnyElysia } from "elysia";

import { serviceOnlyPolicy } from "../auth-policy.ts";
import { dmsErrors } from "../errors.ts";
import {
  CommitDiffRequestSchema,
  CommitDiffResponseSchema,
  FileDiffSchema,
  InternalDiffQuerySchema,
  InternalZipParamsSchema,
  ZipApprovalStatusRequestSchema,
} from "../schemas.ts";

export function createInternalZipMutationRoutes<const App extends AnyElysia>(app: App) {
  return app.group("/v2/internal/files/:id/zips/:zipFileId", (app) =>
    app
      .onBeforeHandle(({ request }) => {
        if (request.headers.has("authorization")) throw dmsErrors.INTERNAL_ENDPOINT();
      })
      .get(
        "/diff",
        ({ params: { id: projectId, zipFileId }, query, documentRuntime }) =>
          documentRuntime.mutations.getInternalDiff(projectId, zipFileId, query.sourceVersion),
        {
          params: InternalZipParamsSchema,
          query: InternalDiffQuerySchema,
          response: FileDiffSchema,
          auth: serviceOnlyPolicy,
          detail: { operationId: "getInternalZipDiff" },
        },
      )
      .patch(
        "/approval-status",
        ({ params: { id: projectId, zipFileId }, body, documentRuntime }) =>
          documentRuntime.mutations.updateZipApprovalStatus(
            projectId,
            zipFileId,
            body.approvalStatus,
            body.error ?? null,
          ),
        {
          params: InternalZipParamsSchema,
          body: ZipApprovalStatusRequestSchema,
          response: "ZipApprovalStatusResponse",
          auth: serviceOnlyPolicy,
          detail: { operationId: "updateInternalZipApprovalStatus" },
        },
      )
      .post(
        "/commit-diff",
        ({ params: { id: projectId, zipFileId }, body, documentRuntime }) =>
          documentRuntime.mutations.commitDiff(projectId, zipFileId, body),
        {
          params: InternalZipParamsSchema,
          body: CommitDiffRequestSchema,
          response: CommitDiffResponseSchema,
          auth: serviceOnlyPolicy,
          detail: { operationId: "commitInternalZipDiff" },
        },
      ),
  );
}
