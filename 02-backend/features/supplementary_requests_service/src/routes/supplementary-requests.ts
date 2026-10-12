import type { AuthPolicy } from "@spark-workflow/authentification";
import { recordAuditEntry } from "@spark-workflow/audit-client/persistence";
import type { DocumentFilesService } from "@spark-workflow/core/documents/resource";
import type { ProjectsService } from "@spark-workflow/core/projects/resource";
import { searchContains } from "@spark-workflow/core/search";
import {
  assertRestQuery,
  RestPaginationQueryProperties,
  RestQueryErrorSchema,
  parseRestPagination,
  restPageResponseSchema,
  restPaginationMetadata,
  resultOf,
  type FeatureHttp,
} from "@spark-workflow/http-host";
import { persistenceError, type PostgresScope } from "@spark-workflow/postgres-runtime";
import { Type as T, type Static } from "@sinclair/typebox";
import { better } from "better-drizzle";
import { Result } from "better-result";
import { and, eq, inArray, or } from "drizzle-orm";
import { status, t } from "elysia";
import { defineErrorCatalog, EvlogError } from "evlog";

import { supplementaryRequests, supplementaryRequestsDatabaseSchema } from "../db/schema.ts";
import {
  CreateSupplementaryRequestSchema,
  SupplementaryRequestPrioritySchema,
  SupplementaryRequestResponse,
  SupplementaryRequestSourceRefSchema,
  SupplementaryRequestSourceTypeSchema,
  SupplementaryRequestUuidSchema,
  UpdateSupplementaryRequestSchema,
} from "../db/schemas.ts";
import type { feature } from "../manifest.ts";

type SupplementaryRequest = Static<typeof SupplementaryRequestResponse>;
type SupplementaryRequestRow = typeof supplementaryRequests.$inferSelect;
type SupplementaryRequestScope = PostgresScope<typeof supplementaryRequestsDatabaseSchema>;
type SupplementaryRequestIdentity = Readonly<{ projectId: string; requestId: string }>;
type CreateSupplementaryRequest = Static<typeof CreateSupplementaryRequestSchema>;
type UpdateSupplementaryRequest = Static<typeof UpdateSupplementaryRequestSchema>;

const supplementaryRequestErrors = defineErrorCatalog("supplementary-requests", {
  FOREIGN_REFERENCE: {
    status: 422,
    message: "Reference outside the project",
    why: "The topic or document does not exist in this project",
    fix: "Reference a topic or document of this project",
  },
  NOT_FOUND: {
    status: 404,
    message: "Supplementary request not found",
    why: "The requested supplementary request does not exist in this project",
    fix: "Refresh the project and use an existing request",
  },
  INVALID_SORT: {
    status: 400,
    message: "Invalid sort parameter",
    why: "The requested sort field or direction is not supported",
    fix: "Sort by created_at or updated_at using asc or desc",
  },
});

const response = (row: SupplementaryRequestRow): SupplementaryRequest => ({
  id: row.id,
  projectId: row.projectId,
  title: row.title,
  reason: row.reason,
  priority: row.priority,
  sourceRef:
    row.sourceType === null || row.sourceItemId === null
      ? null
      : { type: row.sourceType, itemId: row.sourceItemId },
  includedInLetter: row.includedInLetter,
  topicId: row.topicId,
  documentId: row.documentId,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

const found = (identity: SupplementaryRequestIdentity) => (request: SupplementaryRequest | null) =>
  request === null
    ? Result.err(supplementaryRequestErrors.NOT_FOUND({ internal: identity }))
    : Result.ok(request);

const verifyReferences = (
  projects: ProjectsService,
  documents: DocumentFilesService,
  projectId: string,
  data: Pick<UpdateSupplementaryRequest, "topicId" | "documentId">,
) =>
  Result.tryPromise({
    try: async () => {
      const owner = projectId.toLowerCase();
      if (data.topicId) {
        const topic = await projects.getTopic(data.topicId);
        if (topic.isErr()) throw topic.error;
        if (topic.value.projectId !== owner) {
          throw supplementaryRequestErrors.FOREIGN_REFERENCE({
            internal: { projectId, topicId: data.topicId },
          });
        }
      }
      if (data.documentId) {
        const latest = await projects.resolveLatestVersion(owner);
        if (latest.isErr()) throw latest.error;
        if ((await documents.getFile(data.documentId, latest.value)).projectId !== owner) {
          throw supplementaryRequestErrors.FOREIGN_REFERENCE({
            internal: { projectId, documentId: data.documentId },
          });
        }
      }
    },
    catch: (cause) =>
      EvlogError.isEvlogError(cause) && cause.status === 404
        ? supplementaryRequestErrors.FOREIGN_REFERENCE({ cause, internal: { projectId } })
        : persistenceError(cause),
  });

const createRequest = async (
  postgres: SupplementaryRequestScope,
  projects: ProjectsService,
  documents: DocumentFilesService,
  projectId: string,
  data: CreateSupplementaryRequest,
) =>
  (await verifyReferences(projects, documents, projectId, data)).andThenAsync(() =>
    Result.tryPromise({
      try: () =>
        postgres.transact(() =>
          postgres.query(async (transaction) => {
            const created = await better(transaction, {
              schema: supplementaryRequestsDatabaseSchema,
            }).supplementaryRequests.create({
              data: {
                id: crypto.randomUUID(),
                projectId,
                title: data.title,
                priority: data.priority,
                reason: data.reason,
                sourceType: data.sourceRef?.type ?? null,
                sourceItemId: data.sourceRef?.itemId ?? null,
                includedInLetter: data.includedInLetter,
                topicId: data.topicId ?? null,
                documentId: data.documentId ?? null,
              },
            });
            await recordAuditEntry(transaction, {
              projectId,
              entityId: created.id,
              entityType: "supplementary_request",
              changeType: "create",
            });
            return response(created);
          }),
        ),
      catch: persistenceError,
    }),
  );

const updateRequest = async (
  postgres: SupplementaryRequestScope,
  projects: ProjectsService,
  documents: DocumentFilesService,
  identity: SupplementaryRequestIdentity,
  body: UpdateSupplementaryRequest,
) =>
  (await verifyReferences(projects, documents, identity.projectId, body))
    .andThenAsync(() =>
      Result.tryPromise({
        try: () =>
          postgres.transact(() =>
            postgres.query(async (transaction) => {
              const database = better(transaction, {
                schema: supplementaryRequestsDatabaseSchema,
              });
              const where = { id: identity.requestId, projectId: identity.projectId };
              const current = await database.supplementaryRequests.findOne({ where });
              if (current === null) return null;
              const data: Partial<typeof supplementaryRequests.$inferInsert> = {};
              if (body.title !== undefined && body.title !== current.title) data.title = body.title;
              if (body.reason !== undefined && body.reason !== current.reason) {
                data.reason = body.reason;
              }
              if (body.priority !== undefined && body.priority !== current.priority) {
                data.priority = body.priority;
              }
              if (
                body.includedInLetter !== undefined &&
                body.includedInLetter !== current.includedInLetter
              ) {
                data.includedInLetter = body.includedInLetter;
              }
              if (body.sourceRef !== undefined) {
                const sourceType = body.sourceRef?.type ?? null;
                const sourceItemId = body.sourceRef?.itemId ?? null;
                if (sourceType !== current.sourceType || sourceItemId !== current.sourceItemId) {
                  data.sourceType = sourceType;
                  data.sourceItemId = sourceItemId;
                }
              }
              if (body.topicId !== undefined) {
                const topicId = body.topicId?.toLowerCase() ?? null;
                if (topicId !== current.topicId) data.topicId = topicId;
              }
              if (body.documentId !== undefined) {
                const documentId = body.documentId?.toLowerCase() ?? null;
                if (documentId !== current.documentId) data.documentId = documentId;
              }
              const updated =
                Object.keys(data).length === 0
                  ? current
                  : await database.supplementaryRequests.update({ where, data });
              if (updated === null) return null;
              await recordAuditEntry(transaction, {
                projectId: identity.projectId,
                entityId: identity.requestId,
                entityType: "supplementary_request",
                changeType: "update",
              });
              return response(updated);
            }),
          ),
        catch: persistenceError,
      }),
    )
    .then(Result.andThen(found(identity)));

const deleteRequest = (
  postgres: SupplementaryRequestScope,
  identity: SupplementaryRequestIdentity,
) =>
  Result.tryPromise({
    try: () =>
      postgres.transact(() =>
        postgres.query(async (transaction) => {
          const deleted = await better(transaction, {
            schema: supplementaryRequestsDatabaseSchema,
          }).supplementaryRequests.delete({
            where: { id: identity.requestId, projectId: identity.projectId },
          });
          if (deleted === null) return null;
          await recordAuditEntry(transaction, {
            projectId: identity.projectId,
            entityId: identity.requestId,
            entityType: "supplementary_request",
            changeType: "delete",
          });
          return response(deleted);
        }),
      ),
    catch: persistenceError,
  }).then(Result.andThen(found(identity)));

const CollectionParamsSchema = T.Object(
  { projectId: SupplementaryRequestUuidSchema },
  { additionalProperties: false },
);
const ItemParamsSchema = T.Object(
  {
    projectId: SupplementaryRequestUuidSchema,
    requestId: SupplementaryRequestUuidSchema,
  },
  { additionalProperties: false },
);
const ListQuerySchema = T.Object(
  {
    sourceType: T.Optional(t.ArrayQuery(SupplementaryRequestSourceTypeSchema)),
    includedInLetter: T.Optional(t.BooleanString()),
    search: T.Optional(T.String({ maxLength: 1_000 })),
    sort: T.Optional(T.String()),
    limit: t.Numeric({ minimum: 1, maximum: 200, multipleOf: 1, default: 50 }),
    offset: t.Numeric({ minimum: 0, multipleOf: 1, default: 0 }),
  },
  { additionalProperties: false },
);
const V2ListQuerySchema = T.Object(
  {
    includedInLetter: T.Optional(t.BooleanString()),
    priority: T.Optional(SupplementaryRequestPrioritySchema),
    sourceType: T.Optional(SupplementaryRequestSourceTypeSchema),
    topicId: T.Optional(SupplementaryRequestUuidSchema),
    documentId: T.Optional(SupplementaryRequestUuidSchema),
    ...RestPaginationQueryProperties,
  },
  { additionalProperties: true },
);
const SupplementaryRequestPageResponse = restPageResponseSchema(SupplementaryRequestResponse);
const v2FilterParameters = ["includedInLetter", "priority", "sourceType", "topicId", "documentId"];

const createPolicy = {
  permissions: [{ resource: "project", permission: "create", path: "projectId" }],
  bypassRoles: ["admin", "service"],
} satisfies AuthPolicy;
const updatePolicy = {
  permissions: [{ resource: "project", permission: "update", path: "projectId" }],
  bypassRoles: ["admin", "service"],
} satisfies AuthPolicy;
const deletePolicy = {
  permissions: [{ resource: "project", permission: "delete", path: "projectId" }],
  bypassRoles: ["admin", "service"],
} satisfies AuthPolicy;

export const createRoutes = (http: FeatureHttp<typeof feature>) =>
  http
    .controller("supplementary-requests-service.routes.requests")
    .model({ SupplementaryRequestResponse })
    .group("/projects/:projectId/supplementary-requests", (group) =>
      group
        .get(
          "",
          async ({ params, query, postgres }) => {
            const [field, direction, extra] = (query.sort ?? "created_at:asc").split(":");
            if (
              extra !== undefined ||
              (field !== "created_at" && field !== "updated_at") ||
              (direction !== "asc" && direction !== "desc")
            ) {
              throw supplementaryRequestErrors.INVALID_SORT({ internal: { sort: query.sort } });
            }
            const rows = await Result.tryPromise({
              try: () =>
                postgres.query((transaction) =>
                  better(transaction, {
                    schema: supplementaryRequestsDatabaseSchema,
                  }).supplementaryRequests.findMany({
                    where: and(
                      eq(supplementaryRequests.projectId, params.projectId),
                      query.includedInLetter === undefined
                        ? undefined
                        : eq(supplementaryRequests.includedInLetter, query.includedInLetter),
                      query.sourceType?.length
                        ? inArray(supplementaryRequests.sourceType, query.sourceType)
                        : undefined,
                      or(
                        searchContains(supplementaryRequests.title, query.search),
                        searchContains(supplementaryRequests.reason, query.search),
                      ),
                    ),
                    orderBy: [
                      field === "created_at" ? { createdAt: direction } : { updatedAt: direction },
                      { id: direction },
                    ],
                    take: query.limit,
                    skip: query.offset,
                  }),
                ),
              catch: persistenceError,
            });
            if (rows.isErr()) throw rows.error;
            return rows.value.map(response);
          },
          {
            params: CollectionParamsSchema,
            query: ListQuerySchema,
            response: T.Array(SupplementaryRequestResponse),
            detail: { operationId: "listSupplementaryRequests" },
          },
        )
        .get(
          "/letter-items",
          async ({ params, postgres }) => {
            const rows = await Result.tryPromise({
              try: () =>
                postgres.query((transaction) =>
                  better(transaction, {
                    schema: supplementaryRequestsDatabaseSchema,
                  }).supplementaryRequests.findMany({
                    where: { projectId: params.projectId, includedInLetter: true },
                    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
                  }),
                ),
              catch: persistenceError,
            });
            if (rows.isErr()) throw rows.error;
            return rows.value.map(response);
          },
          {
            params: CollectionParamsSchema,
            response: T.Array(SupplementaryRequestResponse),
            detail: { operationId: "getSupplementaryLetterItems" },
          },
        )
        .get(
          "/sources",
          ({ params, postgres }) =>
            postgres.query(async (db) => {
              const rows = await better(db, {
                schema: supplementaryRequestsDatabaseSchema,
              }).supplementaryRequests.findMany({
                select: { sourceType: true, sourceItemId: true },
                where: {
                  projectId: params.projectId,
                  sourceType: { not: null },
                  sourceItemId: { not: null },
                },
                orderBy: [{ createdAt: "asc" }, { id: "asc" }],
              });
              return rows.map(({ sourceType, sourceItemId }) => ({
                type: sourceType!,
                itemId: sourceItemId!,
              }));
            }),
          {
            params: CollectionParamsSchema,
            response: T.Array(SupplementaryRequestSourceRefSchema),
            detail: { operationId: "getSupplementaryRequestSources" },
          },
        )
        .post(
          "",
          async ({ params, body, postgres, projects, documents }) =>
            status(201, await createRequest(postgres, projects, documents, params.projectId, body)),
          {
            params: CollectionParamsSchema,
            body: CreateSupplementaryRequestSchema,
            response: { 201: SupplementaryRequestResponse },
            auth: createPolicy,
            projects: true,
            documents: true,
            detail: { operationId: "createSupplementaryRequest" },
          },
        )
        .patch(
          "/:requestId",
          ({ params, body, postgres, projects, documents }) =>
            updateRequest(postgres, projects, documents, params, body),
          {
            params: ItemParamsSchema,
            body: UpdateSupplementaryRequestSchema,
            response: resultOf(SupplementaryRequestResponse),
            auth: updatePolicy,
            projects: true,
            documents: true,
            detail: { operationId: "updateSupplementaryRequest" },
          },
        )
        .delete("/:requestId", ({ params, postgres }) => deleteRequest(postgres, params), {
          params: ItemParamsSchema,
          response: resultOf(SupplementaryRequestResponse),
          auth: deletePolicy,
          detail: { operationId: "deleteSupplementaryRequest" },
        }),
    );

export const createV2Routes = (http: FeatureHttp<typeof feature>) =>
  http
    .controller("supplementary-requests-service.v2.routes")
    .model({
      SupplementaryRequestV2Response: SupplementaryRequestResponse,
      SupplementaryRequestV2PageResponse: SupplementaryRequestPageResponse,
    })
    .group("/projects/:projectId/supplementary-requests", (group) =>
      group
        .get(
          "",
          async ({ params, query, request, postgres }) => {
            const pagination = parseRestPagination(request, query, [], v2FilterParameters);
            const where = {
              projectId: params.projectId,
              includedInLetter: query.includedInLetter,
              priority: query.priority,
              sourceType: query.sourceType,
              topicId: query.topicId,
              documentId: query.documentId,
            };
            const page = await Result.tryPromise({
              try: () =>
                postgres.query(async (transaction) => {
                  const database = better(transaction, {
                    schema: supplementaryRequestsDatabaseSchema,
                  });
                  const rows = await database.supplementaryRequests.findMany({
                    where,
                    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
                    take: pagination.limit,
                    skip: pagination.offset,
                  });
                  return {
                    data: rows.map(response),
                    total: await database.supplementaryRequests.count({ where }),
                  };
                }),
              catch: persistenceError,
            });
            if (page.isErr()) throw page.error;
            return {
              data: page.value.data,
              pagination: restPaginationMetadata(
                pagination,
                page.value.data.length,
                page.value.total,
              ),
            };
          },
          {
            params: CollectionParamsSchema,
            query: V2ListQuerySchema,
            response: {
              200: SupplementaryRequestPageResponse,
              400: RestQueryErrorSchema,
            },
            detail: { operationId: "listSupplementaryRequestsV2" },
          },
        )
        .post(
          "",
          async ({ params, body, request, postgres, projects, documents }) => {
            assertRestQuery(request);
            return status(
              201,
              await createRequest(postgres, projects, documents, params.projectId, body),
            );
          },
          {
            params: CollectionParamsSchema,
            body: CreateSupplementaryRequestSchema,
            response: { 201: SupplementaryRequestResponse },
            auth: createPolicy,
            projects: true,
            documents: true,
            detail: { operationId: "createSupplementaryRequestV2" },
          },
        )
        .get(
          "/:requestId",
          async ({ params, request, postgres }) => {
            assertRestQuery(request);
            const result = await Result.tryPromise({
              try: () =>
                postgres.query(async (transaction) => {
                  const row = await better(transaction, {
                    schema: supplementaryRequestsDatabaseSchema,
                  }).supplementaryRequests.findOne({
                    where: { id: params.requestId, projectId: params.projectId },
                  });
                  return row === null ? null : response(row);
                }),
              catch: persistenceError,
            }).then(Result.andThen(found(params)));
            if (result.isErr()) throw result.error;
            return result.value;
          },
          {
            params: ItemParamsSchema,
            response: SupplementaryRequestResponse,
            detail: { operationId: "getSupplementaryRequestV2" },
          },
        )
        .patch(
          "/:requestId",
          async ({ params, body, request, postgres, projects, documents }) => {
            assertRestQuery(request);
            return updateRequest(postgres, projects, documents, params, body);
          },
          {
            params: ItemParamsSchema,
            body: UpdateSupplementaryRequestSchema,
            response: resultOf(SupplementaryRequestResponse),
            auth: updatePolicy,
            projects: true,
            documents: true,
            detail: { operationId: "updateSupplementaryRequestV2" },
          },
        )
        .delete(
          "/:requestId",
          async ({ params, request, postgres }) => {
            assertRestQuery(request);
            return deleteRequest(postgres, params);
          },
          {
            params: ItemParamsSchema,
            response: resultOf(SupplementaryRequestResponse),
            auth: deletePolicy,
            detail: { operationId: "deleteSupplementaryRequestV2" },
          },
        ),
    );
