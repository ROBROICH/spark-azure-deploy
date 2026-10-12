import { isoInstant } from "@spark-workflow/http-host";
import { authentication } from "@spark-workflow/authentification";
import { Type as T, type Static } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import { status, t } from "elysia";

import { authenticatedPolicy, createTopicPolicy, projectListPolicy } from "../auth-policy.ts";
import { topics, topicNorms } from "../db/schema.ts";
import { projectLogicModels, type ProjectLogicDatabase, type ProjectLogicScope } from "../db.ts";
import { projectErrors } from "../errors.ts";
import type { CoreRouteApp } from "../http.ts";
import { ProjectVersions } from "../project-versions.ts";
import { executeProjectV2Mutation } from "../v2-mutations.ts";
import {
  CreateTopicSchema,
  TopicIdParamsSchema,
  TopicNormResponseSchema,
  TopicNormStatusSchema,
  TopicResponseSchema,
  type TopicResponse,
  UpdateTopicSchema,
  UuidSchema,
} from "../schemas.ts";

export const TopicListQuerySchema = T.Object({
  projectId: T.Optional(UuidSchema),
  projectVersion: T.Optional(t.Numeric({ minimum: 1 })),
  includeDeleted: T.Optional(T.Boolean({ default: false })),
  page: T.Optional(t.Numeric({ minimum: 1, default: 1 })),
  pageSize: T.Optional(t.Numeric({ minimum: 1, maximum: 200, default: 50 })),
});
const TopicReadQuerySchema = T.Object({
  projectVersion: T.Optional(t.Numeric({ minimum: 1 })),
  includeDeleted: T.Optional(T.Boolean({ default: false })),
});
const TopicBatchQuerySchema = T.Object({
  projectVersion: T.Optional(t.Numeric({ minimum: 1 })),
  includeDeleted: T.Optional(T.Boolean({ default: false })),
  raiseOnMissing: T.Optional(T.Boolean({ default: false })),
});

const response = (row: typeof topics.$inferSelect): TopicResponse => ({
  id: row.id,
  projectId: row.projectId,
  parentTopicId: row.parentTopicId,
  name: row.name,
  description: row.description,
  showInMvp: row.showInMvp,
  showInEwm: row.showInEwm,
  showInBeschluss: row.showInBeschluss,
  isDeleted: row.isDeleted,
  createdAt: isoInstant(row.createdAt),
  updatedAt: isoInstant(row.updatedAt),
});

const currentTopic = async (
  scope: ProjectLogicScope,
  id: string,
  includeDeleted = false,
  projectVersion?: number,
) => {
  const candidates = await scope.query((database) =>
    projectLogicModels(database).topics.findMany({ where: { id } }),
  );
  const latest = await new ProjectVersions(scope).latest([
    ...new Set(candidates.map(({ projectId }) => projectId)),
  ]);
  const row = candidates.find(
    (candidate) =>
      candidate.projectVersion === (projectVersion ?? latest.get(candidate.projectId)) &&
      (includeDeleted || !candidate.isDeleted),
  );
  if (!row) throw projectErrors.NOT_FOUND({ message: `Topic ${id} not found` });
  return row;
};

const batchTopics = async (
  scope: ProjectLogicScope,
  body: readonly string[],
  query: Static<typeof TopicBatchQuerySchema>,
) => {
  if (body.length === 0) return [];
  const ids = [...new Set(body)];
  const candidates = await scope.query((database) =>
    projectLogicModels(database).topics.findMany({ where: { id: { in: ids } } }),
  );
  const latest = await new ProjectVersions(scope).latest([
    ...new Set(candidates.map(({ projectId }) => projectId)),
  ]);
  const found = candidates.filter(
    (row) =>
      row.projectVersion === (query.projectVersion ?? latest.get(row.projectId)) &&
      ((query.includeDeleted ?? false) || !row.isDeleted),
  );
  const byId = new Map(found.map((row) => [row.id, row]));
  if (query.raiseOnMissing) {
    const missing = ids.filter((id) => !byId.has(id));
    if (missing.length) {
      throw projectErrors.NOT_FOUND({
        message: `Topic Topics not found: ${missing.join(", ")} not found`,
      });
    }
  }
  return ids.flatMap((id) => {
    const row = byId.get(id);
    return row ? [response(row)] : [];
  });
};

export const createTopicRoutes = <const App extends CoreRouteApp>(app: App) =>
  app
    .use(authentication)
    .model({
      TopicResponse: TopicResponseSchema,
      TopicNormResponse: TopicNormResponseSchema,
      TopicNormStatus: TopicNormStatusSchema,
    })
    .get(
      "/topics",
      async ({ query, auth, postgres }) => {
        const { projectId } = query;
        const readable = projectId
          ? (await auth.readProject(projectId)).map(() => [projectId])
          : await auth.accessibleResourceIds("project", "read");
        if (readable.isErr()) throw readable.error;
        const projectIds = readable.value === undefined ? undefined : [...readable.value];
        if (projectIds?.length === 0) return [];
        const latest = await new ProjectVersions(postgres).latest(projectIds);
        if (latest.size === 0) return [];
        const versions = [...latest].map(([projectId, latestVersion]) => ({
          projectId,
          projectVersion: query.projectVersion ?? latestVersion,
        }));
        const rows = await postgres.query((database: ProjectLogicDatabase) =>
          projectLogicModels(database).topics.findMany({
            where: query.includeDeleted ? { OR: versions } : { OR: versions, isDeleted: false },
            orderBy: { name: "asc" },
            skip: ((query.page ?? 1) - 1) * (query.pageSize ?? 50),
            take: Math.min(query.pageSize ?? 50, 1_000),
          }),
        );
        return rows.map(response);
      },
      {
        query: TopicListQuerySchema,
        response: T.Array(TopicResponseSchema),
        auth: projectListPolicy,
        detail: { operationId: "listTopics" },
      },
    )
    .post(
      "/topics",
      async ({ body, auth, postgres, projectNodes }) => {
        const { projectId, ...payload } = body;
        const row = await executeProjectV2Mutation(
          projectNodes,
          auth,
          projectId,
          await new ProjectVersions(postgres).latestOne(projectId),
          {
            action: "create",
            nodeType: "topic",
            body: {
              ...payload,
              showInMvp: body.showInMvp ?? true,
              showInEwm: body.showInEwm ?? true,
              showInBeschluss: body.showInBeschluss ?? true,
            },
          },
        );
        return status(201, Value.Parse(TopicResponseSchema, row));
      },
      {
        body: CreateTopicSchema,
        response: { 201: TopicResponseSchema },
        auth: createTopicPolicy,
        projectNodes: true,
        detail: { operationId: "createTopic" },
      },
    )
    .post(
      "/topics/batch",
      async ({ body, query, auth, postgres }) => {
        const found = await batchTopics(postgres, body, query);
        for (const projectId of new Set(found.map((topic) => topic.projectId))) {
          const readable = await auth.readProject(projectId);
          if (readable.isErr()) throw readable.error;
        }
        return found;
      },
      {
        body: T.Array(UuidSchema),
        query: TopicBatchQuerySchema,
        response: T.Array(TopicResponseSchema),
        auth: authenticatedPolicy,
        detail: { operationId: "getTopicsBatch" },
      },
    )
    .patch(
      "/topics/:topicId",
      async ({ params, body, auth, postgres, projectNodes }) => {
        const current = await currentTopic(postgres, params.topicId, true);
        const authorization = await auth.authorize([
          { resource: "project", resourceId: current.projectId, permission: "update" },
        ]);
        if (authorization.isErr()) throw authorization.error;
        const row = await executeProjectV2Mutation(
          projectNodes,
          auth,
          current.projectId,
          current.projectVersion,
          { action: "update", nodeType: "topic", id: params.topicId, body },
        );
        return Value.Parse(TopicResponseSchema, row);
      },
      {
        params: TopicIdParamsSchema,
        body: UpdateTopicSchema,
        response: TopicResponseSchema,
        auth: authenticatedPolicy,
        projectNodes: true,
        detail: { operationId: "updateTopic" },
      },
    )
    .delete(
      "/topics/:topicId",
      async ({ params, auth, postgres, projectNodes }) => {
        const current = await currentTopic(postgres, params.topicId, true);
        const authorization = await auth.authorize([
          { resource: "project", resourceId: current.projectId, permission: "delete" },
        ]);
        if (authorization.isErr()) throw authorization.error;
        const row = await executeProjectV2Mutation(
          projectNodes,
          auth,
          current.projectId,
          current.projectVersion,
          { action: "delete", nodeType: "topic", id: params.topicId },
        );
        return Value.Parse(TopicResponseSchema, row);
      },
      {
        params: TopicIdParamsSchema,
        response: TopicResponseSchema,
        auth: authenticatedPolicy,
        projectNodes: true,
        detail: { operationId: "deleteTopic" },
      },
    )
    .get(
      "/topics/:topicId/norms",
      async ({ params, query, auth, postgres }) => {
        const topic = await currentTopic(
          postgres,
          params.topicId,
          query.includeDeleted ?? false,
          query.projectVersion,
        );
        const readable = await auth.readProject(topic.projectId);
        if (readable.isErr()) throw readable.error;
        const rows: Array<typeof topicNorms.$inferSelect> = await postgres.query(
          (database: ProjectLogicDatabase) =>
            projectLogicModels(database).topicNorms.findMany({
              where: query.includeDeleted
                ? {
                    topicId: params.topicId,
                    projectId: topic.projectId,
                    projectVersion: topic.projectVersion,
                  }
                : {
                    topicId: params.topicId,
                    projectId: topic.projectId,
                    projectVersion: topic.projectVersion,
                    isDeleted: false,
                  },
            }),
        );
        return rows.map((row) => ({
          id: row.id,
          topicId: row.topicId,
          type: row.type.toLowerCase() as "pruefung" | "verfahren",
          projectId: row.projectId,
          projectVersion: row.projectVersion,
          jurabk: row.jurabk,
          paragraphNr: row.paragraphNr ?? "",
          absatz: row.absatz,
          satz: row.satz,
          nummer: row.nummer,
          mvpStatus: row.mvpStatus as "unchecked" | "checked" | "needs_revision",
          satzStatuses: row.satzStatuses as Record<
            string,
            "unchecked" | "checked" | "needs_revision"
          >,
        }));
      },
      {
        params: TopicIdParamsSchema,
        query: TopicReadQuerySchema,
        response: T.Array(TopicNormResponseSchema),
        auth: authenticatedPolicy,
        detail: { operationId: "getTopicNorms" },
      },
    )
    .get(
      "/topics/:topicId",
      async ({ params, query, auth, postgres }) => {
        const topic = await currentTopic(
          postgres,
          params.topicId,
          query.includeDeleted ?? false,
          query.projectVersion,
        );
        const readable = await auth.readProject(topic.projectId);
        if (readable.isErr()) throw readable.error;
        return response(topic);
      },
      {
        params: TopicIdParamsSchema,
        query: TopicReadQuerySchema,
        response: TopicResponseSchema,
        auth: authenticatedPolicy,
        detail: { operationId: "getTopic" },
      },
    );
