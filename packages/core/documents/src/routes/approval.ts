import type { AnyElysia } from "elysia";

import { authenticatedPolicy } from "../auth-policy.ts";
import { notFound } from "../errors.ts";
import {
  ApprovalActionResponseSchema,
  ApprovalDecisionQuerySchema,
  ApprovalStatusSchema,
  CancelResponseSchema,
  FileDiffSchema,
  FileParamsSchema,
} from "../schemas.ts";

export function createApprovalRoutes<const App extends AnyElysia>(app: App) {
  return app
    .model({
      FileDiffResponse: FileDiffSchema,
      ApprovalActionResponse: ApprovalActionResponseSchema,
    })
    .group("/v2/files/:fileId", (app) =>
      app
        .get(
          "/approval-status",
          async ({ params, auth, documentRuntime }) => {
            const zip = await documentRuntime.mutations.zipForAuthorization(params.fileId);
            if (!zip) return Response.json(null);
            const readable = await auth.readProject(zip.projectId);
            if (readable.isErr()) throw readable.error;
            return Response.json(zip.approvalStatus);
          },
          {
            params: FileParamsSchema,
            response: ApprovalStatusSchema,
            auth: authenticatedPolicy,
            detail: { operationId: "getFileApprovalStatus" },
          },
        )
        .get(
          "/diff",
          async ({ params, auth, documentRuntime }) => {
            const zip = await documentRuntime.mutations.zipForAuthorization(params.fileId);
            if (!zip) throw notFound({ message: `Zip file '${params.fileId}' not found.` });
            const readable = await auth.readProject(zip.projectId);
            if (readable.isErr()) throw readable.error;
            return documentRuntime.mutations.getDiff(params.fileId);
          },
          {
            params: FileParamsSchema,
            response: "FileDiffResponse",
            auth: authenticatedPolicy,
            detail: { operationId: "getFileDiff" },
          },
        )
        .post(
          "/decision",
          async ({ params, query, auth, documentRuntime }) => {
            const zip = await documentRuntime.mutations.zipForAuthorization(params.fileId);
            if (!zip?.projectId) throw notFound({ message: "ZIP file not found" });
            const authorization = await auth.authorize(
              [{ resource: "project", resourceId: zip.projectId, permission: "create" }],
              { bypassRoles: ["admin", "service"] },
            );
            if (authorization.isErr()) throw authorization.error;
            return documentRuntime.mutations.submitDecision(params.fileId, query.decision);
          },
          {
            params: FileParamsSchema,
            query: ApprovalDecisionQuerySchema,
            response: "ApprovalActionResponse",
            auth: authenticatedPolicy,
            detail: { operationId: "submitFileApproval" },
          },
        )
        .post(
          "/diff",
          async ({ params, body, auth, documentRuntime }) => {
            const zip = await documentRuntime.mutations.zipForAuthorization(params.fileId);
            if (!zip?.projectId) throw notFound({ message: "ZIP file not found" });
            const authorization = await auth.authorize(
              [{ resource: "project", resourceId: zip.projectId, permission: "create" }],
              { bypassRoles: ["admin", "service"] },
            );
            if (authorization.isErr()) throw authorization.error;
            return documentRuntime.mutations.setDiff(params.fileId, body);
          },
          {
            params: FileParamsSchema,
            body: FileDiffSchema,
            response: "FileDiffResponse",
            auth: authenticatedPolicy,
            detail: { operationId: "setFileDiff" },
          },
        )
        .post(
          "/cancel",
          async ({ params, auth, documentRuntime }) => {
            const zip = await documentRuntime.mutations.zipForAuthorization(params.fileId);
            if (!zip?.projectId) throw notFound({ message: "ZIP file not found" });
            const authorization = await auth.authorize(
              [{ resource: "project", resourceId: zip.projectId, permission: "create" }],
              { bypassRoles: ["admin", "service"] },
            );
            if (authorization.isErr()) throw authorization.error;
            return documentRuntime.mutations.cancelProcessing(params.fileId);
          },
          {
            params: FileParamsSchema,
            response: CancelResponseSchema,
            auth: authenticatedPolicy,
            detail: { operationId: "cancelFileProcessing" },
          },
        ),
    );
}
