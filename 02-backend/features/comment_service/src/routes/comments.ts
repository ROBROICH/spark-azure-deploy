import type { AuthPolicy } from "@spark-workflow/authentification";
import { recordAuditEntry } from "@spark-workflow/audit-client/persistence";
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
import { status, t } from "elysia";

import { commentDatabaseSchema, comments } from "../db/schema.ts";
import {
  CommentResponseSchema,
  CreateCommentBodySchema,
  ProcessStepSchema,
  SourceRefResponseSchema,
  SourceTypeSchema,
  UpdateCommentBodySchema,
  UuidInputSchema,
} from "../db/schemas.ts";
import { commentErrors } from "../errors.ts";
import type { feature } from "../manifest.ts";

type Comment = Static<typeof CommentResponseSchema>;
type CommentRow = typeof comments.$inferSelect;
type CommentScope = PostgresScope<typeof commentDatabaseSchema>;
type CommentIdentity = Readonly<{ projectId: string; commentId: string }>;

const response = (row: CommentRow): Comment => ({
  id: row.id,
  projectId: row.projectId,
  title: row.title,
  content: row.content,
  processStep: row.processStep,
  sourceRef:
    row.sourceType === null
      ? null
      : row.sourceType === "manual"
        ? { type: "manual", itemId: row.sourceItemId }
        : row.sourceItemId === null
          ? null
          : { type: row.sourceType, itemId: row.sourceItemId },
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

const found = (identity: CommentIdentity) => (comment: Comment | null) =>
  comment === null
    ? Result.err(commentErrors.NOT_FOUND({ internal: identity }))
    : Result.ok(comment);

const createComment = (
  postgres: CommentScope,
  projectId: string,
  data: Static<typeof CreateCommentBodySchema>,
) =>
  Result.tryPromise({
    try: () =>
      postgres.transact(() =>
        postgres.query(async (transaction) => {
          const created = await better(transaction, {
            schema: commentDatabaseSchema,
          }).comments.create({
            data: {
              id: crypto.randomUUID(),
              projectId,
              title: data.title,
              content: data.content,
              processStep: data.processStep,
              sourceType: data.sourceRef?.type ?? null,
              sourceItemId: data.sourceRef?.itemId ?? null,
            },
          });
          await recordAuditEntry(transaction, {
            projectId,
            entityId: created.id,
            entityType: "comment",
            changeType: "create",
          });
          return response(created);
        }),
      ),
    catch: persistenceError,
  });

const updateComment = (
  postgres: CommentScope,
  identity: CommentIdentity,
  data: Static<typeof UpdateCommentBodySchema>,
) =>
  Result.tryPromise({
    try: () =>
      postgres.transact(() =>
        postgres.query(async (transaction) => {
          const database = better(transaction, { schema: commentDatabaseSchema });
          const where = { id: identity.commentId, projectId: identity.projectId };
          if (Object.keys(data).length === 0) {
            const current = await database.comments.findOne({ where });
            return current === null ? null : response(current);
          }
          const sourceChanged = Object.hasOwn(data, "sourceRef");
          const updated = await database.comments.update({
            where,
            data: {
              title: data.title,
              content: data.content,
              processStep: data.processStep,
              sourceType: sourceChanged ? (data.sourceRef?.type ?? null) : undefined,
              sourceItemId: sourceChanged ? (data.sourceRef?.itemId ?? null) : undefined,
            },
          });
          if (updated === null) return null;
          await recordAuditEntry(transaction, {
            projectId: identity.projectId,
            entityId: identity.commentId,
            entityType: "comment",
            changeType: "update",
          });
          return response(updated);
        }),
      ),
    catch: persistenceError,
  }).then(Result.andThen(found(identity)));

const deleteComment = (postgres: CommentScope, identity: CommentIdentity) =>
  Result.tryPromise({
    try: () =>
      postgres.transact(() =>
        postgres.query(async (transaction) => {
          const deleted = await better(transaction, {
            schema: commentDatabaseSchema,
          }).comments.delete({
            where: { id: identity.commentId, projectId: identity.projectId },
          });
          if (deleted === null) return null;
          await recordAuditEntry(transaction, {
            projectId: identity.projectId,
            entityId: identity.commentId,
            entityType: "comment",
            changeType: "delete",
          });
          return response(deleted);
        }),
      ),
    catch: persistenceError,
  }).then(Result.andThen(found(identity)));

const CollectionParamsSchema = T.Object(
  { projectId: UuidInputSchema },
  { additionalProperties: false },
);
const ItemParamsSchema = T.Object(
  { projectId: UuidInputSchema, commentId: UuidInputSchema },
  { additionalProperties: false },
);
const ListQuerySchema = T.Object(
  {
    processStep: T.Optional(t.ArrayQuery(ProcessStepSchema)),
    sourceType: T.Optional(t.ArrayQuery(SourceTypeSchema)),
    limit: t.Numeric({ minimum: 1, maximum: 200, multipleOf: 1, default: 50 }),
    offset: t.Numeric({ minimum: 0, multipleOf: 1, default: 0 }),
  },
  { additionalProperties: false },
);
const V2ListQuerySchema = T.Object(
  {
    processStep: T.Optional(t.ArrayQuery(ProcessStepSchema)),
    sourceType: T.Optional(t.ArrayQuery(SourceTypeSchema)),
    ...RestPaginationQueryProperties,
  },
  { additionalProperties: true },
);
const CommentPageResponseSchema = restPageResponseSchema(CommentResponseSchema);

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
    .controller("comment-service.routes")
    .model({
      CommentResponse: CommentResponseSchema,
      CreateCommentRequest: CreateCommentBodySchema,
      UpdateCommentRequest: UpdateCommentBodySchema,
      SourceRef: SourceRefResponseSchema,
      SourceType: SourceTypeSchema,
      ProcessStep: ProcessStepSchema,
    })
    .group("/projects/:projectId/comments", (group) =>
      group
        .get(
          "",
          async ({ postgres, params, query }) => {
            const rows = await Result.tryPromise({
              try: () =>
                postgres.query((transaction) =>
                  better(transaction, { schema: commentDatabaseSchema }).comments.findMany({
                    where: {
                      projectId: params.projectId,
                      processStep: query.processStep?.length
                        ? { in: query.processStep }
                        : undefined,
                      sourceType: query.sourceType?.length ? { in: query.sourceType } : undefined,
                    },
                    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
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
            response: T.Array(CommentResponseSchema),
            detail: { operationId: "listComments" },
          },
        )
        .post(
          "",
          async ({ postgres, params, body }) =>
            status(201, await createComment(postgres, params.projectId, body)),
          {
            params: CollectionParamsSchema,
            body: CreateCommentBodySchema,
            response: { 201: CommentResponseSchema },
            auth: createPolicy,
            detail: { operationId: "createComment" },
          },
        )
        .patch(
          "/:commentId",
          ({ postgres, params, body }) => updateComment(postgres, params, body),
          {
            params: ItemParamsSchema,
            body: UpdateCommentBodySchema,
            response: resultOf(CommentResponseSchema),
            auth: updatePolicy,
            detail: { operationId: "updateComment" },
          },
        )
        .delete(
          "/:commentId",
          async ({ postgres, params }) => {
            const result = await deleteComment(postgres, params);
            if (result.isErr()) throw result.error;
            return status(204);
          },
          {
            params: ItemParamsSchema,
            response: { 204: t.Void() },
            auth: deletePolicy,
            detail: { operationId: "deleteComment" },
          },
        ),
    );

export const createV2Routes = (http: FeatureHttp<typeof feature>) =>
  http
    .controller("comment-service.v2.routes")
    .model({
      CommentV2Response: CommentResponseSchema,
      CommentV2PageResponse: CommentPageResponseSchema,
    })
    .group("/projects/:projectId/comments", (group) =>
      group
        .get(
          "",
          async ({ postgres, params, query, request }) => {
            const pagination = parseRestPagination(request, query, ["processStep", "sourceType"]);
            const where = {
              projectId: params.projectId,
              processStep: query.processStep?.length ? { in: query.processStep } : undefined,
              sourceType: query.sourceType?.length ? { in: query.sourceType } : undefined,
            };
            const page = await Result.tryPromise({
              try: () =>
                postgres.query(async (transaction) => {
                  const database = better(transaction, { schema: commentDatabaseSchema });
                  const rows = await database.comments.findMany({
                    where,
                    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
                    take: pagination.limit,
                    skip: pagination.offset,
                  });
                  return {
                    data: rows.map(response),
                    total: await database.comments.count({ where }),
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
              200: CommentPageResponseSchema,
              400: RestQueryErrorSchema,
            },
            detail: { operationId: "listCommentsV2" },
          },
        )
        .post(
          "",
          async ({ postgres, params, body, request }) => {
            assertRestQuery(request);
            return status(201, await createComment(postgres, params.projectId, body));
          },
          {
            params: CollectionParamsSchema,
            body: CreateCommentBodySchema,
            response: {
              201: CommentResponseSchema,
              400: RestQueryErrorSchema,
            },
            auth: createPolicy,
            detail: { operationId: "createCommentV2" },
          },
        )
        .get(
          "/:commentId",
          async ({ postgres, params, request }) => {
            assertRestQuery(request);
            const result = await Result.tryPromise({
              try: () =>
                postgres.query(async (transaction) => {
                  const row = await better(transaction, {
                    schema: commentDatabaseSchema,
                  }).comments.findOne({
                    where: { id: params.commentId, projectId: params.projectId },
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
            response: {
              200: CommentResponseSchema,
              400: RestQueryErrorSchema,
            },
            detail: { operationId: "getCommentV2" },
          },
        )
        .patch(
          "/:commentId",
          async ({ postgres, params, body, request }) => {
            assertRestQuery(request);
            return updateComment(postgres, params, body);
          },
          {
            params: ItemParamsSchema,
            body: UpdateCommentBodySchema,
            response: {
              200: resultOf(CommentResponseSchema),
              400: RestQueryErrorSchema,
            },
            auth: updatePolicy,
            detail: { operationId: "updateCommentV2" },
          },
        )
        .delete(
          "/:commentId",
          async ({ postgres, params, request }) => {
            assertRestQuery(request);
            return deleteComment(postgres, params);
          },
          {
            params: ItemParamsSchema,
            response: {
              200: resultOf(CommentResponseSchema),
              400: RestQueryErrorSchema,
            },
            auth: deletePolicy,
            detail: { operationId: "deleteCommentV2" },
          },
        ),
    );
