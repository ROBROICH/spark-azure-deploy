import { isoInstant } from "@spark-workflow/http-host";
import { recordAuditEntry } from "@spark-workflow/audit-client/persistence";
import { authentication } from "@spark-workflow/authentification";
import { Type as T } from "@sinclair/typebox";
import {
  and,
  asc,
  desc,
  eq,
  getTableColumns,
  gte,
  inArray,
  lte,
  max,
  or,
  sql,
} from "drizzle-orm";
import { status, t } from "elysia";

import { authenticatedPolicy, createDeadlinePolicy, projectListPolicy } from "../auth-policy.ts";
import { projectLogicModels, type ProjectLogicDatabase, type ProjectLogicScope } from "../db.ts";
import { deadlines, projects, projectVersionLocks } from "../db/schema.ts";
import { projectErrors } from "../errors.ts";
import type { CoreRouteApp } from "../http.ts";
import { lockProjectVersionWrites, ProjectVersions } from "../project-versions.ts";
import {
  CreateDeadlineSchema,
  DeadlineIdParamsSchema,
  DeadlineResponseSchema,
  UpdateDeadlineSchema,
  assertDeadlineRange,
  type DeadlineResponse,
  UuidSchema,
} from "../schemas.ts";

const DeadlineListQuerySchema = T.Object({
  projectId: T.Optional(UuidSchema),
  endingOnOrAfter: T.Optional(T.String({ format: "date" })),
  date: T.Optional(T.String({ format: "date" })),
  limit: t.Numeric({ minimum: 1, maximum: 200, multipleOf: 1, default: 50 }),
  offset: t.Numeric({ minimum: 0, multipleOf: 1, default: 0 }),
});

const response = (row: {
  id: string;
  projectId: string;
  startAt: string | null;
  endAt: string | null;
  deadlineType: string | null;
  legalBasis: string | null;
  createdAt: Date;
  updatedAt: Date;
}): DeadlineResponse => ({
  id: row.id,
  projectId: row.projectId,
  startAt: row.startAt ?? "",
  endAt: row.endAt ?? "",
  deadlineType: row.deadlineType ?? "",
  legalBasis: row.legalBasis,
  createdAt: isoInstant(row.createdAt),
  updatedAt: isoInstant(row.updatedAt),
});

const currentDeadlines = (client: ProjectLogicDatabase) => {
  const projectVersions = client
    .select({
      projectId: projects.id,
      version:
        sql<number>`coalesce(${max(projectVersionLocks.sourceVersion)}, ${max(projects.projectVersion)})`.as(
          "version",
        ),
    })
    .from(projects)
    .leftJoin(
      projectVersionLocks,
      and(eq(projectVersionLocks.projectId, projects.id), eq(projectVersionLocks.status, "ACTIVE")),
    )
    .where(eq(projects.isDeleted, false))
    .groupBy(projects.id)
    .as("current_project_version");
  return client
    .selectDistinctOn([deadlines.projectId, deadlines.id], getTableColumns(deadlines))
    .from(deadlines)
    .innerJoin(
      projectVersions,
      and(
        eq(projectVersions.projectId, deadlines.projectId),
        lte(deadlines.projectVersion, projectVersions.version),
      ),
    )
    .orderBy(deadlines.projectId, deadlines.id, desc(deadlines.projectVersion))
    .as("current_deadline");
};

const findCurrentDeadline = (scope: ProjectLogicScope, projectId: string, id: string) =>
  scope.query(async (client) => {
    const current = currentDeadlines(client);
    const [row] = await client
      .select()
      .from(current)
      .where(and(eq(current.projectId, projectId), eq(current.id, id)));
    return row?.isDeleted === false ? row : null;
  });

const deadlineOwner = async (scope: ProjectLogicScope, id: string): Promise<string> => {
  const owners = await scope.query((client) =>
    client
      .selectDistinct({ projectId: deadlines.projectId })
      .from(deadlines)
      .where(eq(deadlines.id, id)),
  );
  if (owners.length > 1) {
    throw projectErrors.CONFLICT({ message: `Deadline ${id} belongs to multiple projects` });
  }
  const [owner] = owners;
  if (owner === undefined) throw projectErrors.NOT_FOUND({ message: `Deadline ${id} not found` });
  return owner.projectId;
};

const lockWritableVersion = async (scope: ProjectLogicScope, projectId: string) => {
  await lockProjectVersionWrites(scope, projectId);
  const versions = new ProjectVersions(scope);
  return versions.ensureWritable(projectId, await versions.latestOne(projectId));
};

const lockCurrentDeadline = async (scope: ProjectLogicScope, projectId: string, id: string) => {
  const projectVersion = await lockWritableVersion(scope, projectId);
  const current = await findCurrentDeadline(scope, projectId, id);
  if (current === null) throw projectErrors.NOT_FOUND({ message: `Deadline ${id} not found` });
  if (current.projectVersion !== projectVersion) {
    const { sysPeriod: _sysPeriod, ...carried } = current;
    await scope.query((client) =>
      projectLogicModels(client).deadlines.create({ data: { ...carried, projectVersion } }),
    );
  }
  return { ...current, projectVersion };
};

export const createDeadlineRoutes = <const App extends CoreRouteApp>(app: App) =>
  app
    .use(authentication)
    .model({ DeadlineResponse: DeadlineResponseSchema })
    .get(
      "/deadlines",
      async ({ query, auth, postgres }) => {
        const accessible = await auth.accessibleResourceIds("project", "read");
        if (accessible.isErr()) throw accessible.error;
        if (accessible.value?.length === 0) return [];
        if (query.projectId && accessible.value && !accessible.value.includes(query.projectId)) {
          return [];
        }
        const rows = await postgres.query((client: ProjectLogicDatabase) => {
          const current = currentDeadlines(client);
          return client
            .select()
            .from(current)
            .where(
              and(
                eq(current.isDeleted, false),
                query.projectId ? eq(current.projectId, query.projectId) : undefined,
                accessible.value ? inArray(current.projectId, [...accessible.value]) : undefined,
                query.date
                  ? or(eq(current.startAt, query.date), eq(current.endAt, query.date))
                  : undefined,
                query.endingOnOrAfter ? gte(current.endAt, query.endingOnOrAfter) : undefined,
              ),
            )
            .orderBy(asc(current.endAt), asc(current.id))
            .limit(query.limit)
            .offset(query.offset);
        });
        return rows.map(response);
      },
      {
        query: DeadlineListQuerySchema,
        response: T.Array(DeadlineResponseSchema),
        auth: projectListPolicy,
        detail: { operationId: "listDeadlines" },
      },
    )
    .get(
      "/deadline-dates",
      async ({ query, auth, postgres }) => {
        const accessible = await auth.accessibleResourceIds("project", "read");
        if (accessible.isErr()) throw accessible.error;
        if (accessible.value?.length === 0) return { dates: [] };
        const monthStart = sql`date_trunc('month', ${query.month}::timestamp)::date`;
        const monthEnd = sql`(${monthStart} + interval '1 month')::date`;
        return postgres.query(async (client: ProjectLogicDatabase) => {
          const current = currentDeadlines(client);
          const rows = await client
            .select({
              date: sql<string>`dates.date::text`.as("date"),
            })
            .from(current)
            .innerJoin(
              sql`unnest(array[${current.startAt}, ${current.endAt}]) as dates(date)`,
              sql`true`,
            )
            .where(
              and(
                eq(current.isDeleted, false),
                accessible.value ? inArray(current.projectId, [...accessible.value]) : undefined,
                sql`dates.date >= ${monthStart}`,
                sql`dates.date < ${monthEnd}`,
              ),
            )
            .groupBy(sql`dates.date`)
            .orderBy(asc(sql`dates.date`));
          return { dates: rows.map(({ date }) => date) };
        });
      },
      {
        query: T.Object({ month: T.String({ format: "date" }) }),
        response: T.Object({ dates: T.Array(T.String({ format: "date" })) }),
        auth: projectListPolicy,
        detail: { operationId: "listDeadlineDates" },
      },
    )
    .post(
      "/deadlines",
      async ({ body, postgres }) => {
        assertDeadlineRange(body);
        const created = await postgres.transact(async () => {
          const projectVersion = await lockWritableVersion(postgres, body.projectId);
          return postgres.query(async (client: ProjectLogicDatabase) => {
            const transaction = projectLogicModels(client);
            const row = await transaction.deadlines.create({
              data: {
                id: crypto.randomUUID(),
                projectId: body.projectId,
                projectVersion,
                startAt: body.startAt,
                endAt: body.endAt,
                deadlineType: body.deadlineType,
                legalBasis: body.legalBasis,
              },
            });
            await recordAuditEntry(client, {
              projectId: row.projectId,
              entityId: row.id,
              entityType: "deadline",
              changeType: "create",
            });
            return row;
          });
        });
        return status(201, response(created));
      },
      {
        body: CreateDeadlineSchema,
        response: { 201: DeadlineResponseSchema },
        auth: createDeadlinePolicy,
        detail: { operationId: "createDeadline" },
      },
    )
    .patch(
      "/deadlines/:deadlineId",
      async ({ params, body, auth, postgres }) => {
        const projectId = await deadlineOwner(postgres, params.deadlineId);
        const authorization = await auth.authorize([
          { resource: "project", resourceId: projectId, permission: "update" },
        ]);
        if (authorization.isErr()) throw authorization.error;
        if (Object.keys(body).length === 0) {
          const current = await findCurrentDeadline(postgres, projectId, params.deadlineId);
          if (current === null) {
            throw projectErrors.NOT_FOUND({ message: `Deadline ${params.deadlineId} not found` });
          }
          return response(current);
        }
        const updated = await postgres.transact(async () => {
          const current = await lockCurrentDeadline(postgres, projectId, params.deadlineId);
          assertDeadlineRange({
            startAt: body.startAt === undefined ? current.startAt : body.startAt,
            endAt: body.endAt === undefined ? current.endAt : body.endAt,
          });
          return postgres.query(async (client: ProjectLogicDatabase) => {
            const row = await projectLogicModels(client).deadlines.update({
              where: {
                id: current.id,
                projectId,
                projectVersion: current.projectVersion,
                isDeleted: false,
              },
              data: body,
            });
            if (row === null) {
              throw projectErrors.NOT_FOUND({ message: `Deadline ${params.deadlineId} not found` });
            }
            await recordAuditEntry(client, {
              projectId,
              entityId: row.id,
              entityType: "deadline",
              changeType: "update",
            });
            return row;
          });
        });
        return response(updated);
      },
      {
        params: DeadlineIdParamsSchema,
        body: UpdateDeadlineSchema,
        response: DeadlineResponseSchema,
        auth: authenticatedPolicy,
        detail: { operationId: "updateDeadline" },
      },
    )
    .delete(
      "/deadlines/:deadlineId",
      async ({ params, auth, postgres }) => {
        const projectId = await deadlineOwner(postgres, params.deadlineId);
        const authorization = await auth.authorize([
          { resource: "project", resourceId: projectId, permission: "delete" },
        ]);
        if (authorization.isErr()) throw authorization.error;
        const deleted = await postgres.transact(async () => {
          const current = await lockCurrentDeadline(postgres, projectId, params.deadlineId);
          return postgres.query(async (client: ProjectLogicDatabase) => {
            const row = await projectLogicModels(client).deadlines.update({
              where: {
                id: current.id,
                projectId,
                projectVersion: current.projectVersion,
                isDeleted: false,
              },
              data: { isDeleted: true },
            });
            if (row === null) {
              throw projectErrors.NOT_FOUND({ message: `Deadline ${params.deadlineId} not found` });
            }
            await recordAuditEntry(client, {
              projectId,
              entityId: row.id,
              entityType: "deadline",
              changeType: "delete",
            });
            return current;
          });
        });
        return response(deleted);
      },
      {
        params: DeadlineIdParamsSchema,
        response: DeadlineResponseSchema,
        auth: authenticatedPolicy,
        detail: { operationId: "deleteDeadline" },
      },
    )
    .get(
      "/deadlines/:deadlineId",
      async ({ params, auth, postgres }) => {
        const projectId = await deadlineOwner(postgres, params.deadlineId);
        const readable = await auth.readProject(projectId);
        if (readable.isErr()) throw readable.error;
        const row = await findCurrentDeadline(postgres, projectId, params.deadlineId);
        if (row === null) {
          throw projectErrors.NOT_FOUND({ message: `Deadline ${params.deadlineId} not found` });
        }
        return response(row);
      },
      {
        params: DeadlineIdParamsSchema,
        response: DeadlineResponseSchema,
        auth: authenticatedPolicy,
        detail: { operationId: "getDeadline" },
      },
    );
