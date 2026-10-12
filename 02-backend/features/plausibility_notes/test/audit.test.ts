import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { auditLogs } from "@spark-workflow/audit-client/schema";
import { Documents } from "@spark-workflow/core/documents/resource";
import {
  projectNodesProvider,
  projectsProvider,
  usecasesProvider,
} from "@spark-workflow/core/projects/runtime";
import { projectHistory, projectLogicSchema, projects } from "@spark-workflow/core/projects/schema";
import { createFeatureHttp, createHttpHost } from "@spark-workflow/http-host";
import {
  createPostgresRuntime,
  PostgreSQL,
  type PostgresResourceRuntime,
} from "@spark-workflow/postgres-runtime";
import { composeFeatures, defineFeature, provideValue } from "@spark-workflow/resource";
import type { ResourceRuntime } from "@spark-workflow/resource";
import { makeEffectResourceRuntime } from "@spark-workflow/resource/effect";
import { useStrictAuthentication } from "@spark-workflow/test-support/strict-auth";
import { and, eq, inArray } from "drizzle-orm";

import {
  plausibilityNoteHistory,
  plausibilityNoteOccurrenceHistory,
  plausibilityNoteOccurrences,
  plausibilityNotes,
  plausibilityResultDeliveries,
  plausibilitySchema,
} from "../src/db/schema.ts";
import { createRoutes, createV2Routes, feature } from "../src/index.ts";

process.env.EVLOG_SILENT = "0";

const databaseUrl = process.env.PLAUSIBILITY_MUTATION_DATABASE_URL;
const describeDatabaseTests = databaseUrl === undefined ? describe.skip : describe;
const schema = { ...projectLogicSchema, ...plausibilitySchema, auditLogs };
const actorUserId = "5c000000-0000-4000-8000-000000000001";

describeDatabaseTests("plausibility note writes leave one attributed audit row", () => {
  const projectId = crypto.randomUUID();
  const resultCases = [
    { name: "nonempty", projectId: crypto.randomUUID(), fileId: crypto.randomUUID(), noteId: crypto.randomUUID() },
    { name: "empty", projectId: crypto.randomUUID(), fileId: crypto.randomUUID(), noteId: null },
  ] as const;
  const additionalResults: Array<{
    fileId: string;
    projectId: string;
    projectVersion?: number;
    bytes: Uint8Array;
  }> = [];
  const shadowProjectId = crypto.randomUUID();
  const memberId = "5c000000-0000-4000-8000-000000000002";
  const strangerId = "5c000000-0000-4000-8000-000000000003";
  const projectIds = [projectId, shadowProjectId, ...resultCases.map((result) => result.projectId)];
  const noteIds = { update: crypto.randomUUID(), delete: crypto.randomUUID() };
  let database: PostgresResourceRuntime<typeof schema>;
  let resources: ResourceRuntime<
    typeof PostgreSQL | (typeof feature.needs)[keyof typeof feature.needs]
  >;
  let app: { handle(request: Request): Promise<Response> };
  let authentication: Awaited<ReturnType<typeof useStrictAuthentication>>;

  beforeAll(async () => {
    authentication = await useStrictAuthentication([
      `${memberId} update project:${projectId}`,
      `${memberId} delete project:${projectId}`,
    ]);
    database = createPostgresRuntime({
      url: databaseUrl!,
      schema,
      pool: {
        maxConnections: 4,
        idleTimeoutSeconds: 5,
        connectionTimeoutSeconds: 5,
        maxLifetimeSeconds: 60,
        closeTimeoutSeconds: 5,
      },
    });
    await database.ready();
    await database.query(async (query) => {
      await query.insert(projects).values(projectIds.map((id) => ({ id, createdById: actorUserId })));
      await query.insert(plausibilityNotes).values(
        Object.values(noteIds).map((id) => ({
          id,
          projectId,
          description: "Contradiction",
          status: "OPEN",
        })),
      );
    });
    resources = makeEffectResourceRuntime(
      composeFeatures([
        feature,
        defineFeature({
          id: "plausibility-audit-platform",
          needs: {},
          providers: [
            provideValue(PostgreSQL, database),
            projectNodesProvider,
            projectsProvider,
            usecasesProvider,
            provideValue(Documents, {
              async readResultFile(fileId: string) {
                const additional = additionalResults.find((result) => result.fileId === fileId);
                if (additional !== undefined) {
                  return { ...additional, projectVersion: additional.projectVersion ?? 1 };
                }
                const result = resultCases.find((result) => result.fileId === fileId)!;
                return {
                  projectId: result.projectId,
                  projectVersion: 1,
                  bytes: new TextEncoder().encode(JSON.stringify({
                    contradictions: result.noteId === null ? [] : [{
                      id: result.noteId,
                      title: "Inconsistent dimensions",
                      description: "The plan and application use different dimensions.",
                      rating: 50,
                      status: "OPEN",
                      occurrences: [{
                        documentId: "test-document",
                        documentName: null,
                        contentExcerpt: "Original evidence",
                        pageNumber: null,
                      }],
                    }],
                  })),
                };
              },
            }),
          ] as const,
          tables: {},
        }),
      ] as const),
    );
    const http = createFeatureHttp(resources).for(feature);
    app = createHttpHost("plausibility-audit-test").use(createRoutes(http)).use(createV2Routes(http));
  });

  afterAll(async () => {
    authentication.stop();
    mock.restore();
    await database.query(async (query) => {
      await query
        .delete(plausibilityResultDeliveries)
        .where(inArray(plausibilityResultDeliveries.projectId, projectIds));
      await query
        .delete(plausibilityNoteOccurrences)
        .where(inArray(plausibilityNoteOccurrences.projectId, projectIds));
      await query.delete(plausibilityNotes).where(inArray(plausibilityNotes.projectId, projectIds));
      await query
        .delete(plausibilityNoteHistory)
        .where(inArray(plausibilityNoteHistory.projectId, projectIds));
      await query
        .delete(plausibilityNoteOccurrenceHistory)
        .where(inArray(plausibilityNoteOccurrenceHistory.projectId, projectIds));
      await query.delete(auditLogs).where(inArray(auditLogs.projectId, projectIds));
      await query.delete(projects).where(inArray(projects.id, projectIds));
      await query.delete(projectHistory).where(inArray(projectHistory.id, projectIds));
    });
    await resources.close();
    await database.close();
  });

  const send = async (
    path: string,
    init: { method?: string; body?: object; headers?: Record<string, string> } = {},
  ) =>
    app.handle(
      new Request(`http://localhost${path}`, {
        method: init.method ?? "GET",
        headers: {
          "content-type": "application/json",
          ...(init.headers ?? (await authentication.userToken(actorUserId, ["service"]))),
        },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
      }),
    );
  const deliver = (deliveryProjectId: string, fileId: string, projectVersion = 1) =>
    send(`/plausibility-notes/${deliveryProjectId}/job-done?projectVersion=${projectVersion}`, {
      method: "POST",
      body: { fileId },
    });
  const projectAuditRows = (auditProjectId: string) =>
    database.query((query) =>
      query.select({ id: auditLogs.id }).from(auditLogs).where(eq(auditLogs.projectId, auditProjectId)),
    );
  const noteStatuses = (noteId: string) =>
    database.query((query) =>
      query
        .select({ projectId: plausibilityNotes.projectId, status: plausibilityNotes.status })
        .from(plausibilityNotes)
        .where(eq(plausibilityNotes.id, noteId))
        .orderBy(plausibilityNotes.projectVersion),
    );

  test("note reads exclude deleted occurrences while retaining the active note", async () => {
    const noteId = crypto.randomUUID();
    const occurrenceId = crypto.randomUUID();
    await database.query(async (query) => {
      await query
        .insert(plausibilityNotes)
        .values({ id: noteId, projectId, description: "Deleted evidence", status: "OPEN" });
      await query.insert(plausibilityNoteOccurrences).values({
        id: occurrenceId,
        projectId,
        plausibilityNoteId: noteId,
        documentId: "test-document",
        contentExcerpt: "Removed evidence",
        isDeleted: true,
      });
    });
    const response = await send(`/plausibility-notes/${projectId}`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      contradictions: { id: string; occurrences: unknown[] }[];
    };
    expect(body.contradictions.find((note) => note.id === noteId)?.occurrences).toEqual([]);
  });

  test("node mutations reject out-of-range scores without changing the note", async () => {
    const noteId = crypto.randomUUID();
    await database.query((query) =>
      query.insert(plausibilityNotes).values({
        id: noteId,
        projectId,
        description: "Numeric boundary",
        status: "OPEN",
        scoreA: 50,
      }),
    );
    for (const payload of [
      { scoreA: 101 },
      { scoreB: -1 },
      { confidenceScore: 101 },
      { mergedCount: 0 },
    ]) {
      const legacy = await send(`/${projectId}/update?projectVersion=1`, {
        method: "POST",
        body: { updates: [{ nodeType: "plausibility_note", id: noteId, payload }] },
      });
      expect(legacy.status).toBe(422);
      const v2 = await send(`/projects/${projectId}/plausibility-notes/${noteId}?projectVersion=1`, {
        method: "PATCH",
        body: payload,
      });
      expect(v2.status).toBe(422);
    }
    expect(
      await database.query((query) =>
        query
          .select({ scoreA: plausibilityNotes.scoreA })
          .from(plausibilityNotes)
          .where(eq(plausibilityNotes.id, noteId)),
      ),
    ).toEqual([{ scoreA: 50 }]);
  });

  test("the database rejects an occurrence assigned to a note of another project", async () => {
    const noteId = crypto.randomUUID();
    await database.query((query) =>
      query
        .insert(plausibilityNotes)
        .values({ id: noteId, projectId, description: "Project boundary", status: "OPEN" }),
    );
    await expect(
      database.query((query) =>
        query.insert(plausibilityNoteOccurrences).values({
          id: crypto.randomUUID(),
          projectId: shadowProjectId,
          plausibilityNoteId: noteId,
          documentId: "test-document",
          contentExcerpt: "Cross-project evidence",
        }),
      ),
    ).rejects.toThrow();
  });

  test("node APIs reject a parent of another project and keep the original parent", async () => {
    const parentId = crypto.randomUUID();
    const childId = crypto.randomUUID();
    const payload = { plausibilityNoteId: parentId, documentId: "document", contentExcerpt: "Evidence" };
    const batch = await send(`/${projectId}/update?projectVersion=1`, {
      method: "POST",
      body: {
        inserts: [
          { id: childId, nodeType: "plausibility_note_occurrence", payload },
          {
            id: parentId,
            nodeType: "plausibility_note",
            payload: { description: "Batch parent", status: "OPEN" },
          },
        ],
      },
    });
    expect(batch.status).toBe(200);
    const foreignParent = crypto.randomUUID();
    await database.query((query) =>
      query.insert(plausibilityNotes).values({
        id: foreignParent,
        projectId: shadowProjectId,
        description: "Foreign parent",
        status: "OPEN",
      }),
    );
    const rejected = [
      await send(`/projects/${projectId}/plausibility-note-occurrences?projectVersion=1`, {
        method: "POST",
        body: { ...payload, plausibilityNoteId: foreignParent },
      }),
      await send(`/projects/${projectId}/plausibility-note-occurrences/${childId}?projectVersion=1`, {
        method: "PATCH",
        body: { plausibilityNoteId: foreignParent },
      }),
      await send(`/${projectId}/update?projectVersion=1`, {
        method: "POST",
        body: {
          updates: [
            {
              id: childId,
              nodeType: "plausibility_note_occurrence",
              payload: { plausibilityNoteId: foreignParent },
            },
          ],
        },
      }),
    ];
    expect(rejected.map((response) => response.status)).toEqual([422, 422, 422]);
    expect(
      await database.query((query) =>
        query
          .select({ plausibilityNoteId: plausibilityNoteOccurrences.plausibilityNoteId })
          .from(plausibilityNoteOccurrences)
          .where(eq(plausibilityNoteOccurrences.id, childId)),
      ),
    ).toEqual([{ plausibilityNoteId: parentId }]);
    await database.query((query) =>
      query.delete(plausibilityNotes).where(eq(plausibilityNotes.id, foreignParent)),
    );
  });

  test("projectless note actions reject two authorized project candidates", async () => {
    const noteId = crypto.randomUUID();
    await database.query(async (query) => {
      await query
        .insert(projects)
        .values({ id: shadowProjectId, projectVersion: 2, createdById: actorUserId });
      await query.insert(plausibilityNotes).values([
        { id: noteId, projectId, description: "Original", status: "OPEN", projectVersion: 1 },
        {
          id: noteId,
          projectId: shadowProjectId,
          description: "Other project",
          status: "OPEN",
          projectVersion: 2,
        },
      ]);
    });
    for (const method of ["PATCH", "DELETE"]) {
      const response = await send(`/plausibility-notes/notes/${noteId}`, {
        method,
        body: method === "PATCH" ? { status: "RESOLVED" } : undefined,
      });
      expect(response.status).toBe(409);
      const body = await response.text();
      expect(body).not.toContain(projectId);
      expect(body).not.toContain(shadowProjectId);
    }
    expect(await noteStatuses(noteId)).toEqual([
      { projectId, status: "OPEN" },
      { projectId: shadowProjectId, status: "OPEN" },
    ]);
    const strangerHeaders = await authentication.userToken(strangerId, ["user"]);
    const denied = await send(`/plausibility-notes/notes/${noteId}`, {
      method: "PATCH",
      headers: strangerHeaders,
      body: { status: "RESOLVED" },
    });
    const absent = await send(`/plausibility-notes/notes/${crypto.randomUUID()}`, {
      method: "PATCH",
      headers: strangerHeaders,
      body: { status: "RESOLVED" },
    });
    expect(denied.status).toBe(404);
    expect(absent.status).toBe(404);
    expect(await denied.json()).toEqual(await absent.json());
    const memberHeaders = await authentication.userToken(memberId, ["user"]);
    const updated = await send(`/plausibility-notes/notes/${noteId}`, {
      method: "PATCH",
      headers: memberHeaders,
      body: { status: "RESOLVED" },
    });
    expect(updated.status).toBe(200);
    expect(await noteStatuses(noteId)).toEqual([
      { projectId, status: "RESOLVED" },
      { projectId: shadowProjectId, status: "OPEN" },
    ]);
    const removed = await send(`/plausibility-notes/notes/${noteId}`, {
      method: "DELETE",
      headers: memberHeaders,
    });
    expect(removed.status).toBe(200);
    expect(await noteStatuses(noteId)).toEqual([{ projectId: shadowProjectId, status: "OPEN" }]);
    await database.query(async (query) => {
      await query.delete(plausibilityNotes).where(eq(plausibilityNotes.id, noteId));
      await query
        .delete(projects)
        .where(and(eq(projects.id, shadowProjectId), eq(projects.projectVersion, 2)));
    });
  });

  test("concurrent delivery, fresh analysis, old retries and changed sources keep exact outcomes", async () => {
    const deliveryProject = crypto.randomUUID();
    projectIds.push(deliveryProject);
    const noteId = crypto.randomUUID();
    const source = (description: string) =>
      new TextEncoder().encode(
        JSON.stringify({
          contradictions: [
            {
              id: noteId,
              title: null,
              description,
              rating: null,
              status: "OPEN",
              occurrences: [
                {
                  documentId: "source-document",
                  documentName: null,
                  contentExcerpt: description,
                  pageNumber: null,
                },
              ],
            },
          ],
        }),
      );
    const first = { fileId: crypto.randomUUID(), projectId: deliveryProject, bytes: source("Original") };
    const next = { fileId: crypto.randomUUID(), projectId: deliveryProject, bytes: source("New analysis") };
    additionalResults.push(first, next);
    await database.query((query) =>
      query.insert(projects).values({ id: deliveryProject, createdById: actorUserId }),
    );
    const descriptions = () =>
      database.query((query) =>
        query
          .select({ description: plausibilityNotes.description })
          .from(plausibilityNotes)
          .where(eq(plausibilityNotes.id, noteId)),
      );
    const occurrences = () =>
      database.query((query) =>
        query
          .select()
          .from(plausibilityNoteOccurrences)
          .where(eq(plausibilityNoteOccurrences.projectId, deliveryProject)),
      );
    const concurrent = await Promise.all([
      deliver(deliveryProject, first.fileId),
      deliver(deliveryProject, first.fileId),
    ]);
    expect(concurrent.map((response) => response.status)).toEqual([200, 200]);
    const originalOutcome = await concurrent[0]!.json();
    expect(await concurrent[1]!.json()).toEqual(originalOutcome);
    const duplicated = JSON.parse(new TextDecoder().decode(next.bytes));
    duplicated.contradictions.push(duplicated.contradictions[0]);
    const failed = {
      fileId: crypto.randomUUID(),
      projectId: deliveryProject,
      bytes: new TextEncoder().encode(JSON.stringify(duplicated)),
    };
    additionalResults.push(failed);
    expect((await deliver(deliveryProject, failed.fileId)).status).toBe(409);
    expect(await descriptions()).toEqual([{ description: "Original" }]);
    expect(
      await database.query((query) =>
        query
          .select({ fileId: plausibilityResultDeliveries.fileId })
          .from(plausibilityResultDeliveries)
          .where(eq(plausibilityResultDeliveries.fileId, failed.fileId)),
      ),
    ).toEqual([]);
    const fresh = await deliver(deliveryProject, next.fileId);
    expect(fresh.status).toBe(200);
    const freshOutcome = await fresh.json();
    const before = await occurrences();
    for (const [fileId, outcome] of [
      [first.fileId, originalOutcome],
      [next.fileId, freshOutcome],
    ] as const) {
      const repeated = await deliver(deliveryProject, fileId);
      expect(repeated.status).toBe(200);
      expect(await repeated.json()).toEqual(outcome);
    }
    expect(await occurrences()).toEqual(before);
    expect(await descriptions()).toEqual([{ description: "New analysis" }]);
    first.bytes = source("Overwritten original file");
    expect((await deliver(deliveryProject, first.fileId)).status).toBe(409);
    await database.query((query) =>
      query.insert(projects).values({ id: deliveryProject, projectVersion: 2, createdById: actorUserId }),
    );
    expect((await deliver(deliveryProject, next.fileId)).status).toBe(200);
    const unseen = {
      fileId: crypto.randomUUID(),
      projectId: deliveryProject,
      bytes: source("Unseen stale analysis"),
    };
    additionalResults.push(unseen);
    expect((await deliver(deliveryProject, unseen.fileId)).status).toBe(409);
    expect(await projectAuditRows(deliveryProject)).toHaveLength(2);
  });

  const auditRows = (entityId: string) =>
    database.query((query) =>
      query
        .select({
          entityType: auditLogs.entityType,
          changeType: auditLogs.changeType,
          actorUserId: auditLogs.actorUserId,
        })
        .from(auditLogs)
        .where(eq(auditLogs.entityId, entityId)),
    );

  for (const [changeType, method, body] of [
    ["update", "PATCH", { status: "RESOLVED" }],
    ["delete", "DELETE", undefined],
  ] as const) {
    test(`note ${changeType} records one ${changeType} row`, async () => {
      const response = await app.handle(
        new Request(`http://localhost/plausibility-notes/notes/${noteIds[changeType]}`, {
          method,
          headers: {
            "content-type": "application/json",
            ...(await authentication.userToken(actorUserId, ["service"])),
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        }),
      );

      expect(response.status).toBe(200);
      expect(await auditRows(noteIds[changeType])).toEqual([
        { entityType: "plausibility_note", changeType, actorUserId },
      ]);
    });
  }
  for (const result of resultCases) {
    test(`${result.name} result ingestion records one attributed project action and a re-run replaces reviewed notes`, async () => {
      const response = await app.handle(new Request(
        `http://localhost/plausibility-notes/${result.projectId}/job-done?projectVersion=1`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(await authentication.userToken(actorUserId, ["service"])),
          },
          body: JSON.stringify({ fileId: result.fileId }),
        },
      ));
      expect(response.status).toBe(200);
      expect(await database.query((query) => query.select({ id: plausibilityNotes.id })
        .from(plausibilityNotes).where(eq(plausibilityNotes.projectId, result.projectId))))
        .toEqual(result.noteId === null ? [] : [{ id: result.noteId }]);
      expect(await database.query((query) => query.select({
        entityType: auditLogs.entityType, entityId: auditLogs.entityId,
        changeType: auditLogs.changeType, actionType: auditLogs.actionType,
        actorUserId: auditLogs.actorUserId,
      }).from(auditLogs).where(eq(auditLogs.projectId, result.projectId)))).toEqual([{
        entityType: "project", entityId: result.projectId, changeType: "action",
        actionType: "plausibility_results_processed", actorUserId,
      }]);
      if (result.noteId === null) return;
      await database.query(async (query) => {
        await query
          .update(plausibilityNotes)
          .set({ status: "RESOLVED", isDeleted: true })
          .where(eq(plausibilityNotes.id, result.noteId));
        await query.insert(plausibilityNotes).values({
          id: crypto.randomUUID(),
          projectId: result.projectId,
          description: "Manual note",
          status: "OPEN",
          updateType: "MANUAL",
        });
        await query
          .update(plausibilityNoteOccurrences)
          .set({ isDeleted: true })
          .where(eq(plausibilityNoteOccurrences.projectId, result.projectId));
      });
      const notes = () =>
        database.query((query) =>
          query.select().from(plausibilityNotes).where(eq(plausibilityNotes.projectId, result.projectId)),
        );
      const occurrences = () =>
        database.query((query) =>
          query
            .select()
            .from(plausibilityNoteOccurrences)
            .where(eq(plausibilityNoteOccurrences.projectId, result.projectId)),
        );
      const [reviewedNotes, reviewedOccurrences] = [await notes(), await occurrences()];
      expect((await deliver(result.projectId, result.fileId)).status).toBe(200);
      expect(await notes()).toEqual(reviewedNotes);
      expect(await occurrences()).toEqual(reviewedOccurrences);
      expect(await projectAuditRows(result.projectId)).toHaveLength(1);
      const freshFileId = crypto.randomUUID();
      additionalResults.push({
        fileId: freshFileId,
        projectId: result.projectId,
        bytes: new TextEncoder().encode('{"contradictions":[]}'),
      });
      expect((await deliver(result.projectId, freshFileId)).status).toBe(200);
      expect(await notes()).toEqual([]);
      expect(await projectAuditRows(result.projectId)).toHaveLength(2);
    });
  }
});
