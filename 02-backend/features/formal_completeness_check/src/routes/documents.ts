import { files } from "@spark-workflow/core/documents/schema";
import { searchContains } from "@spark-workflow/core/search";
import { isoInstant, RequestedProjectVersionQuery, type FeatureHttp } from "@spark-workflow/http-host";
import { supplementaryRequests } from "@spark-workflow/supplementary-requests-service/schema";
import { and, asc, desc, eq, exists, inArray, isNotNull, or, sql } from "drizzle-orm";
import { createSelectSchema } from "drizzle-typebox";
import { t } from "elysia";

import { serviceOnlyPolicy, updateProjectPolicy } from "../auth-policy.ts";
import { documents, documentTypes } from "../db/schema.ts";
import type { feature } from "../manifest.ts";
import { updateDocumentAssignment } from "../mutations.ts";
import {
  DocumentAssignmentItemSchema,
  DocumentParamsSchema,
  FormalCompletenessResultsSchema,
  JobDoneRequestSchema,
  JobDoneResponseSchema,
  PatchDocumentSchema,
  ProjectParamsSchema,
} from "../schemas.ts";

const DocumentListStatusSchema = t.UnionEnum(["assigned", "unassigned", "requested"]);
const DocumentListItemSchema = t.Composite([
  t.Pick(createSelectSchema(files, { createdAt: t.String({ format: "date-time" }) }), [
    "id", "projectId", "filename", "mimeType", "createdAt",
  ]),
  t.Object({
    documentTypeId: t.Nullable(t.String({ format: "uuid" })),
    documentTypeName: t.Nullable(t.String()),
    humanRequiredDocumentTypeId: t.Nullable(t.String({ format: "uuid" })),
    aiSuggestedRequiredDocumentTypeId: t.Nullable(t.String({ format: "uuid" })),
    confidence: t.Nullable(t.Number()),
    status: DocumentListStatusSchema,
  }),
]);

export const createDocumentRoutes = (http: FeatureHttp<typeof feature>) =>
  http
    .controller("formal-completeness-check.routes.documents")
    .model({
      FormalCompletenessCheckResults: FormalCompletenessResultsSchema,
      V1FormalCompletenessJobDoneResponse: JobDoneResponseSchema,
    })
    .get(
      "/:projectId/documents",
      async ({ params, query, postgres, projectVersion }) => {
        const rows = await postgres.query((db) => {
          const documentTypeId = sql<string | null>`coalesce(${documents.humanRequiredDocumentTypeId}, ${documents.aiSuggestedRequiredDocumentTypeId})`;
          const requested = exists(db.select({ id: supplementaryRequests.id })
            .from(supplementaryRequests)
            .where(and(
              eq(supplementaryRequests.projectId, params.projectId),
              inArray(supplementaryRequests.sourceType, ["tableOfContents", "requiredDocuments"]),
              eq(supplementaryRequests.sourceItemId, sql`${files.id}::text`),
            )));
          const status = sql<"assigned" | "unassigned" | "requested">`case when ${requested} then 'requested' when ${documentTypeId} is null then 'unassigned' else 'assigned' end`;
          return db.select({
            id: files.id,
            projectId: files.projectId,
            filename: files.filename,
            mimeType: files.mimeType,
            createdAt: files.createdAt,
            documentTypeId,
            documentTypeName: documentTypes.name,
            humanRequiredDocumentTypeId: documents.humanRequiredDocumentTypeId,
            aiSuggestedRequiredDocumentTypeId: documents.aiSuggestedRequiredDocumentTypeId,
            confidence: documents.confidence,
            status,
          })
            .from(files)
            .leftJoin(documents, and(
              eq(documents.fileId, files.id),
              eq(documents.projectId, files.projectId),
              eq(documents.projectVersion, files.projectVersion),
              eq(documents.isDeleted, false),
            ))
            .leftJoin(documentTypes, and(
              eq(documentTypes.id, documentTypeId),
              eq(documentTypes.projectId, files.projectId),
              eq(documentTypes.projectVersion, files.projectVersion),
              eq(documentTypes.isDeleted, false),
            ))
            .where(and(
              eq(files.projectId, params.projectId),
              eq(files.projectVersion, projectVersion),
              eq(files.type, "DOCUMENT"),
              eq(files.isDeleted, false),
              query.documentTypeId?.length ? inArray(documentTypeId, query.documentTypeId) : undefined,
              query.status?.length ? inArray(status, query.status) : undefined,
              or(
                searchContains(sql`regexp_replace(${files.filename}, '^.*/', '')`, query.search),
                searchContains(documentTypes.name, query.search),
              ),
            ))
            .orderBy(desc(files.createdAt), desc(files.id))
            .limit(query.limit)
            .offset(query.offset);
        });
        return rows.map((row) => ({ ...row, createdAt: isoInstant(row.createdAt) }));
      },
      {
        params: ProjectParamsSchema,
        query: t.Object({
          limit: t.Numeric({ minimum: 1, maximum: 200, multipleOf: 1, default: 50 }),
          offset: t.Numeric({ minimum: 0, multipleOf: 1, default: 0 }),
          search: t.Optional(t.String({ maxLength: 1_000 })),
          documentTypeId: t.Optional(t.ArrayQuery(t.String({ format: "uuid" }))),
          status: t.Optional(t.ArrayQuery(DocumentListStatusSchema)),
        }, { additionalProperties: false }),
        response: t.Array(DocumentListItemSchema),
        auth: {
          permissions: [{ resource: "project", permission: "read", path: "projectId" }],
          bypassRoles: ["admin", "service"],
        },
        projectVersion: true,
        detail: { operationId: "listFormalDocuments" },
      },
    )
    .get(
      "/:projectId/document-summary",
      async ({ params, postgres, projectVersion }) => {
        const assigned = await postgres.query((db) => {
          const documentTypeId = sql<string>`coalesce(${documents.humanRequiredDocumentTypeId}, ${documents.aiSuggestedRequiredDocumentTypeId})`;
          return db.selectDistinct({ documentTypeId })
            .from(documents)
            .innerJoin(files, and(
              eq(files.id, documents.fileId),
              eq(files.projectId, documents.projectId),
              eq(files.projectVersion, documents.projectVersion),
              eq(files.isDeleted, false),
              eq(files.type, "DOCUMENT"),
            ))
            .where(and(
              eq(documents.projectId, params.projectId),
              eq(documents.projectVersion, projectVersion),
              eq(documents.isDeleted, false),
              isNotNull(documentTypeId),
            ))
            .orderBy(asc(documentTypeId));
        });
        return { assignedTypeIds: assigned.map(({ documentTypeId }) => documentTypeId) };
      },
      {
        params: ProjectParamsSchema,
        response: t.Object({ assignedTypeIds: t.Array(t.String({ format: "uuid" })) }),
        projectVersion: true,
        detail: { operationId: "getFormalDocumentSummary" },
      },
    )
    .patch(
      "/:projectId/documents/:fileId",
      async ({ params, body, postgres, projects, projectVersion }) => {
        const updated = await updateDocumentAssignment({
          postgres,
          projects,
          projectId: params.projectId,
          projectVersion,
          target: { kind: "fileId", fileId: params.fileId },
          humanRequiredDocumentTypeId: body.humanRequiredDocumentTypeId,
        });
        return {
          fileId: params.fileId,
          aiSuggestedRequiredDocumentTypeId: updated.aiSuggestedRequiredDocumentTypeId,
          humanRequiredDocumentTypeId: updated.humanRequiredDocumentTypeId,
          confidence: updated.confidence,
        };
      },
      {
        params: DocumentParamsSchema,
        body: PatchDocumentSchema,
        response: DocumentAssignmentItemSchema,
        auth: updateProjectPolicy,
        projects: true,
        latestProjectVersion: true,
        detail: { operationId: "patchDocumentAssignment" },
      },
    )
    .post(
      "/:projectId/results",
      ({ params, query, body, formalCompleteness }) =>
        formalCompleteness.sendResults(params.projectId, query.projectVersion, body.fileId),
      {
        params: ProjectParamsSchema,
        query: RequestedProjectVersionQuery,
        body: JobDoneRequestSchema,
        response: JobDoneResponseSchema,
        auth: serviceOnlyPolicy,
        formalCompleteness: true,
        detail: { operationId: "processFormalCompletenessResults" },
      },
    )
    .get(
      "/:projectId",
      ({ params, projectVersion, formalCompleteness }) =>
        formalCompleteness.getResults(params.projectId, projectVersion),
      {
        params: ProjectParamsSchema,
        response: FormalCompletenessResultsSchema,
        projectVersion: true,
        formalCompleteness: true,
        detail: { operationId: "getFormalCompletenessResults" },
      },
    );
