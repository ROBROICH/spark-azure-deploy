import { recordAuditEntry } from "@spark-workflow/audit-client/persistence";
import { RequestedProjectVersionQuery, type FeatureHttp } from "@spark-workflow/http-host";
import {
  transactVersionWrite,
  type ProjectVersionPeer,
  type RequestAuthorization,
} from "@spark-workflow/node-crud";
import type { PostgresScope } from "@spark-workflow/postgres-runtime";
import type { TSchema } from "@sinclair/typebox";
import { better } from "better-drizzle";

import { plausibilitySchema } from "../db/schema.ts";
import { plausibilityErrors } from "../errors.ts";
import type { feature } from "../manifest.ts";
import {
  ContradictionOccurrenceSchema,
  ContradictionSchema,
  JobDoneRequestSchema,
  JobDoneResponseSchema,
  NoteParamsSchema,
  PlausibilityCheckResultSchema,
  PlausibilityStatusSchema,
  ProjectParamsSchema,
  SuccessResponseSchema,
  UpdateNoteRequestSchema,
} from "../schemas.ts";

async function activeNote(
  postgres: PostgresScope<typeof plausibilitySchema>,
  projects: ProjectVersionPeer,
  auth: RequestAuthorization,
  noteId: string,
  permission: "update" | "delete",
) {
  const identities = await postgres.query(async (query) =>
    better(query, { schema: plausibilitySchema }).plausibilityNotes.findMany({
      where: { id: noteId },
      select: { projectId: true },
    }),
  );
  let selected: { projectId: string; projectVersion: number } | undefined;
  for (const projectId of new Set(identities.map((identity) => identity.projectId))) {
    const authorization = await auth.authorize(
      [{ resource: "project", resourceId: projectId, permission }],
      { bypassRoles: ["admin", "service"] },
    );
    if (authorization.isErr()) {
      if (authorization.error.status >= 500) throw authorization.error;
      continue;
    }
    const version = await projects.resolveLatestVersion(projectId);
    if (version.isErr()) {
      if (version.error.status === 404) continue;
      throw version.error;
    }
    const note = await postgres.query(async (query) =>
      better(query, { schema: plausibilitySchema }).plausibilityNotes.findOne({
        where: { projectId, id: noteId, projectVersion: version.value, isDeleted: false },
        select: { projectVersion: true },
      }),
    );
    if (note === null) continue;
    if (selected !== undefined) {
      throw plausibilityErrors.NOTE_IDENTITY_AMBIGUOUS({ internal: { noteId } });
    }
    selected = { projectId, projectVersion: note.projectVersion };
  }
  if (selected === undefined) throw plausibilityErrors.NOTE_NOT_FOUND({ internal: { noteId } });
  return selected;
}

export const createPlausibilityNoteRoutes = (http: FeatureHttp<typeof feature>) =>
  http
    .controller("plausibility-notes.routes")
    .model({
      Contradiction: ContradictionSchema,
      ContradictionOccurrence: ContradictionOccurrenceSchema,
      PlausibilityCheckResult: PlausibilityCheckResultSchema,
      V1PlausibilityJobDoneResponse: JobDoneResponseSchema,
      V1PlausibilitySuccessResponse: SuccessResponseSchema,
      PlausibilityNoteStatus: PlausibilityStatusSchema,
    })
    .group("/plausibility-notes", (app) =>
      app
        .get(
          "/:projectId",
          async ({ params, postgres, projectVersion }) => {
            const contradictions = await postgres.query(async (query) =>
              better(query, { schema: plausibilitySchema }).plausibilityNotes.findMany({
                where: {
                  projectId: params.projectId,
                  projectVersion,
                  isDeleted: false,
                },
                select: {
                  id: true,
                  title: true,
                  description: true,
                  rating: true,
                  confidenceScore: true,
                  scoreA: true,
                  scoreB: true,
                  evidence: true,
                  mergedCount: true,
                  status: true,
                  occurrences: {
                    where: {
                      projectId: params.projectId,
                      projectVersion,
                      isDeleted: false,
                    },
                    select: {
                      documentId: true,
                      documentName: true,
                      contentExcerpt: true,
                      pageNumber: true,
                      contradiction: true,
                    },
                    orderBy: { createdAt: "asc" },
                  },
                },
                orderBy: { createdAt: "asc" },
              }),
            );
            return { contradictions };
          },
          {
            params: ProjectParamsSchema,
            response: PlausibilityCheckResultSchema as TSchema,
            latestProjectVersion: true,
            detail: { operationId: "getPlausibilityNotes" },
          },
        )
        .post(
          "/:projectId/job-done",
          ({ params, query, body, plausibilityNotes }) =>
            plausibilityNotes.sendResults(params.projectId, body.fileId, query.projectVersion),
          {
            params: ProjectParamsSchema,
            query: RequestedProjectVersionQuery,
            body: JobDoneRequestSchema,
            response: JobDoneResponseSchema,
            auth: { roles: ["service"] },
            plausibilityNotes: true,
            detail: { operationId: "processPlausibilityJobResults" },
          },
        )
        .patch(
          "/notes/:noteId",
          async ({ params, body, auth, postgres, projects }) => {
            const note = await activeNote(postgres, projects, auth, params.noteId, "update");
            await transactVersionWrite(
              {
                postgres,
                projects,
                projectId: note.projectId,
                projectVersion: note.projectVersion,
              },
              async () => {
                await postgres.query(async (query) => {
                  const updated = await better(query, {
                    schema: plausibilitySchema,
                  }).plausibilityNotes.update({
                    where: {
                      projectId: note.projectId,
                      id: params.noteId,
                      projectVersion: note.projectVersion,
                      isDeleted: false,
                    },
                    data: { status: body.status },
                  });
                  if (updated === null) {
                    throw plausibilityErrors.NOTE_NOT_FOUND({
                      internal: { noteId: params.noteId },
                    });
                  }
                  await recordAuditEntry(query, {
                    projectId: note.projectId,
                    entityType: "plausibility_note",
                    entityId: params.noteId,
                    changeType: "update",
                  });
                });
              },
            );
            return { success: true };
          },
          {
            params: NoteParamsSchema,
            body: UpdateNoteRequestSchema,
            response: SuccessResponseSchema,
            auth: { roles: ["admin", "user", "service"] },
            projects: true,
            detail: { operationId: "updatePlausibilityNote" },
          },
        )
        .delete(
          "/notes/:noteId",
          async ({ params, auth, postgres, projects }) => {
            const note = await activeNote(postgres, projects, auth, params.noteId, "delete");
            await transactVersionWrite(
              {
                postgres,
                projects,
                projectId: note.projectId,
                projectVersion: note.projectVersion,
              },
              async () => {
                await postgres.query(async (query) => {
                  const deleted = await better(query, {
                    schema: plausibilitySchema,
                  }).plausibilityNotes.delete({
                    where: {
                      projectId: note.projectId,
                      id: params.noteId,
                      projectVersion: note.projectVersion,
                      isDeleted: false,
                    },
                  });
                  if (deleted === null) {
                    throw plausibilityErrors.NOTE_NOT_FOUND({
                      internal: { noteId: params.noteId },
                    });
                  }
                  await recordAuditEntry(query, {
                    projectId: note.projectId,
                    entityType: "plausibility_note",
                    entityId: params.noteId,
                    changeType: "delete",
                  });
                });
              },
            );
            return { success: true };
          },
          {
            params: NoteParamsSchema,
            response: SuccessResponseSchema,
            auth: { roles: ["admin", "user", "service"] },
            projects: true,
            detail: { operationId: "deletePlausibilityNote" },
          },
        ),
    );
