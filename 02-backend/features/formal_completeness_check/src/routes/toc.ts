import { isoInstant, RequestedProjectVersionQuery, type FeatureHttp } from "@spark-workflow/http-host";
import { transactVersionWrite } from "@spark-workflow/node-crud";
import { recordAuditEntries, recordAuditEntry } from "@spark-workflow/audit-client/persistence";
import { Type } from "@sinclair/typebox";
import { better, type SelectInput } from "better-drizzle";
import { and, eq } from "drizzle-orm";
import { status } from "elysia";

import { createProjectPolicy, serviceOnlyPolicy, updateProjectPolicy } from "../auth-policy.ts";
import { formalCompletenessSchema, tocNotes } from "../db/schema.ts";
import { formalCompletenessErrors } from "../errors.ts";
import type { feature } from "../manifest.ts";
import {
  CreateTocNotesSchema,
  JobDoneRequestSchema,
  ProjectParamsSchema,
  TableContentNotesResponseSchema,
  TocJobDoneResponseSchema,
  TocNoteParamsSchema,
  TocNotesWithStatusResponseSchema,
  UpdateTocNoteSchema,
} from "../schemas.ts";

const tocNoteSelect = {
  id: true,
  projectId: true,
  content: true,
  isResolved: true,
  createdAt: true,
  updatedAt: true,
} satisfies SelectInput<typeof formalCompletenessSchema, "tocNotes">;

const serializeTimestamps = <Row extends { createdAt: Date; updatedAt: Date }>(row: Row) =>
  Object.assign(row, {
    createdAt: isoInstant(row.createdAt),
    updatedAt: isoInstant(row.updatedAt),
  });

export const createTocRoutes = (http: FeatureHttp<typeof feature>) =>
  http
    .controller("formal-completeness-check.routes.toc")
    .model({
      TocNotesWithStatusResponse: TocNotesWithStatusResponseSchema,
      TableContentNotesResponse: TableContentNotesResponseSchema,
      TocJobDoneResponse: TocJobDoneResponseSchema,
    })
    .get(
      "/:projectId/toc-notes",
      async ({ params, postgres, projectVersion }) => {
        const [notes, storedStatus] = await postgres.query(async (query) => {
          const database = better(query, { schema: formalCompletenessSchema });
          return Promise.all([
            database.tocNotes.findMany({
              select: tocNoteSelect,
              where: {
                projectId: params.projectId,
                projectVersion,
                isDeleted: false,
                OR: [{ generatedKey: null }, { isOutdated: false }],
              },
              orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            }),
            database.tocStatuses.findFirst({
              select: { status: true },
              where: {
                projectId: params.projectId,
                projectVersion,
                isDeleted: false,
              },
            }),
          ]);
        });
        return {
          status:
            storedStatus?.status === "success" ||
            storedStatus?.status === "no_inhaltsverzeichnis_found"
              ? storedStatus.status
              : null,
          notes: notes.map(serializeTimestamps),
        };
      },
      {
        params: ProjectParamsSchema,
        response: TocNotesWithStatusResponseSchema,
        latestProjectVersion: true,
        detail: { operationId: "getTocNotes" },
      },
    )
    .post(
      "/:projectId/toc-notes",
      async ({ params, body, postgres, projects, projectVersion }) => {
        if (body.length === 0) return status(201, []);
        const values: (typeof tocNotes.$inferInsert)[] = body.map((note) => ({
          id: crypto.randomUUID(),
          projectId: params.projectId,
          projectVersion,
          content: note.content,
        }));
        const created = await transactVersionWrite(
          { postgres, projects, projectId: params.projectId, projectVersion },
          async () => {
            return postgres.query(async (query) => {
              const inserted = await better(query, {
                schema: formalCompletenessSchema,
              }).tocNotes.createMany({ data: values, select: tocNoteSelect });
              await recordAuditEntries(query, {
                projectId: params.projectId,
                entries: (inserted.data ?? []).map(({ id }) => ({
                  entityType: "table_of_content_notes",
                  entityId: id,
                  changeType: "create",
                })),
              });
              return inserted;
            });
          },
        );
        return status(201, (created.data ?? []).map(serializeTimestamps));
      },
      {
        params: ProjectParamsSchema,
        body: CreateTocNotesSchema,
        response: { 201: Type.Array(TableContentNotesResponseSchema) },
        auth: createProjectPolicy,
        projects: true,
        latestProjectVersion: true,
        detail: { operationId: "createTocNotes" },
      },
    )
    .post(
      "/:projectId/toc-notes/results",
      ({ params, query, body, formalCompleteness }) =>
        formalCompleteness.sendTocResults(params.projectId, query.projectVersion, body.fileId),
      {
        params: ProjectParamsSchema,
        query: RequestedProjectVersionQuery,
        body: JobDoneRequestSchema,
        response: TocJobDoneResponseSchema,
        auth: serviceOnlyPolicy,
        formalCompleteness: true,
        detail: { operationId: "processTocResults" },
      },
    )
    .patch(
      "/:projectId/toc-notes/:noteId",
      async ({ params, body, postgres, projects, projectVersion }) => {
        return await transactVersionWrite(
          { postgres, projects, projectId: params.projectId, projectVersion },
          async () => {
            return postgres.query(async (transaction) => {
              const [updated] = await transaction
                .update(tocNotes)
                .set({ isResolved: body.isResolved })
                .where(
                  and(
                    eq(tocNotes.id, params.noteId),
                    eq(tocNotes.projectId, params.projectId),
                    eq(tocNotes.projectVersion, projectVersion),
                    eq(tocNotes.isDeleted, false),
                  ),
                )
                .returning({
                  id: tocNotes.id,
                  projectId: tocNotes.projectId,
                  content: tocNotes.content,
                  isResolved: tocNotes.isResolved,
                  createdAt: tocNotes.createdAt,
                  updatedAt: tocNotes.updatedAt,
                });
              if (updated === undefined) {
                throw formalCompletenessErrors.TOC_NOTE_NOT_FOUND({
                  message: `TOC note with id=${params.noteId} not found for projectId=${params.projectId}`,
                  internal: {
                    projectId: params.projectId,
                    projectVersion,
                    noteId: params.noteId,
                  },
                });
              }
              await recordAuditEntry(transaction, {
                projectId: params.projectId,
                entityType: "table_of_content_notes",
                entityId: params.noteId,
                changeType: "update",
              });
              return serializeTimestamps(updated);
            });
          },
        );
      },
      {
        params: TocNoteParamsSchema,
        body: UpdateTocNoteSchema,
        response: TableContentNotesResponseSchema,
        auth: updateProjectPolicy,
        projects: true,
        latestProjectVersion: true,
        detail: { operationId: "updateTocNote" },
      },
    );
