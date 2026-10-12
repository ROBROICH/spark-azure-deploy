import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { auditLogs } from "@spark-workflow/audit-client/schema";
import type { HttpJson } from "@spark-workflow/http-host";
import { and, asc, eq } from "drizzle-orm";

import { commentDatabaseSchema, commentHistory, comments } from "../../src/db/schema.ts";
import { type CommentDatabaseRuntime, createCommentDatabaseRuntime } from "../support/database.ts";
import {
  CommentResponseSchema,
  ErrorResponseSchema,
  ValidationErrorResponseSchema,
  parseMutationContract,
} from "../support/mutation-contracts.ts";

import { deleteMutation, requestMutationJson } from "../support/external-app.ts";

interface RequestContext {
  actorUserId: string;
  requestId: string;
  requestStartTime: string;
  triggeredByUserId: string;
  workflowRunId: string;
  workflowType: string;
}

const mutationSelectorNames = [
  "COMMENT_BASE_URL",
  "COMMENT_DATABASE_URL",
  "COMMENT_ATOMIC_FAILURE_BASE_URL",
  "COMMENT_ATOMIC_FAILURE_DATABASE_URL",
] as const;
const mutationOnlySelectorNames = [
  "COMMENT_DATABASE_URL",
  "COMMENT_ATOMIC_FAILURE_BASE_URL",
  "COMMENT_ATOMIC_FAILURE_DATABASE_URL",
] as const;
const mutationRequested = mutationOnlySelectorNames.some((name) => process.env[name] !== undefined);
const missingMutationSelectors = mutationSelectorNames.filter((name) => !process.env[name]?.trim());

if (mutationRequested && missingMutationSelectors.length > 0) {
  throw new Error(
    `Comment mutation contract configuration is partial; missing ${missingMutationSelectors.join(", ")}`,
  );
}

const mutationConfigured = mutationRequested;
const mutationTest = mutationConfigured ? test : test.skip;

let database: CommentDatabaseRuntime;
let restrictedDatabase: CommentDatabaseRuntime;

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for the Comment mutation contract`);
  return value;
}

function requestContext(): RequestContext {
  return {
    actorUserId: crypto.randomUUID(),
    requestId: crypto.randomUUID(),
    requestStartTime: new Date().toISOString(),
    triggeredByUserId: crypto.randomUUID(),
    workflowRunId: `comment-test-${crypto.randomUUID()}`,
    workflowType: "CommentMutationTest",
  };
}

function auditHeaders(context: RequestContext) {
  return {
    "X-Actor-User-Id": context.actorUserId,
    "X-Request-Id": context.requestId,
    "X-Request-Starttime": context.requestStartTime,
    "X-Triggered-By-User-Id": context.triggeredByUserId,
    "X-Workflow-Run-Id": context.workflowRunId,
    "X-Workflow-Type": context.workflowType,
  };
}

const collectionPath = (projectId: string) => `/projects/${projectId}/comments`;
const itemPath = (projectId: string, commentId: string) =>
  `${collectionPath(projectId)}/${commentId}`;

async function cleanupProject(projectId: string): Promise<void> {
  await database.query(async (query) => {
    await query.delete(comments).where(eq(comments.projectId, projectId));
    await query.delete(commentHistory).where(eq(commentHistory.projectId, projectId));
    await query.delete(auditLogs).where(eq(auditLogs.projectId, projectId));
  });
}

async function currentRows(projectId: string) {
  return database.query(async (query) =>
    query
      .select()
      .from(comments)
      .where(eq(comments.projectId, projectId))
      .orderBy(asc(comments.createdAt), asc(comments.id)),
  );
}

async function historyRows(projectId: string) {
  return database.query(async (query) =>
    query
      .select()
      .from(commentHistory)
      .where(eq(commentHistory.projectId, projectId))
      .orderBy(asc(commentHistory.createdAt), asc(commentHistory.id)),
  );
}

async function auditRows(projectId: string) {
  return database.query(async (query) =>
    query
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.projectId, projectId))
      .orderBy(asc(auditLogs.timestamp), asc(auditLogs.id)),
  );
}

async function createComment(
  projectId: string,
  body: HttpJson,
  context = requestContext(),
  target: "primary" | "atomic-failure" = "primary",
) {
  const response = await requestMutationJson("POST", collectionPath(projectId), {
    body,
    headers: auditHeaders(context),
    target,
  });
  expect(response.status).toBe(201);
  return {
    body: parseMutationContract(CommentResponseSchema, response.body),
    context,
  };
}

beforeAll(async () => {
  if (!mutationConfigured) return;
  database = createCommentDatabaseRuntime(
    requiredEnvironment("COMMENT_DATABASE_URL"),
    commentDatabaseSchema,
  );
  restrictedDatabase = createCommentDatabaseRuntime(
    requiredEnvironment("COMMENT_ATOMIC_FAILURE_DATABASE_URL"),
    commentDatabaseSchema,
  );
  await Promise.all([database.ready(), restrictedDatabase.ready()]);
});

afterAll(async () => {
  if (!mutationConfigured) return;
  await Promise.all([database?.close(), restrictedDatabase?.close()]);
});

describe("Comment Service HTTP mutation contract", () => {
  test("removes an undeclared response field from the parsed result", () => {
    const value = {
      id: crypto.randomUUID(),
      projectId: crypto.randomUUID(),
      title: "Strict response",
      content: "The original value must be checked.",
      processStep: "unsorted" as const,
      sourceRef: null,
      createdAt: "2026-07-16T12:00:00Z",
      updatedAt: "2026-07-16T12:00:00Z",
      incidental: true,
    };

    const parsed = parseMutationContract(CommentResponseSchema, value);

    expect(parsed).toEqual({
      id: value.id,
      projectId: value.projectId,
      title: value.title,
      content: value.content,
      processStep: value.processStep,
      sourceRef: value.sourceRef,
      createdAt: value.createdAt,
      updatedAt: value.updatedAt,
    });
  });

  mutationTest(
    "creates omitted, explicit-null, manual, and referenced sources and commits audit",
    async () => {
      const projectId = crypto.randomUUID();
      const cases = [
        {
          payload: {
            title: "Omitted source",
            content: "The source_ref member is omitted.",
            processStep: "unsorted",
          },
          expectedSource: null,
          expectedStored: { sourceType: null, sourceItemId: null },
        },
        {
          payload: {
            title: "Explicit null source",
            content: "The source_ref member is explicitly null.",
            processStep: "formalCompletenessCheck",
            sourceRef: null,
          },
          expectedSource: null,
          expectedStored: { sourceType: null, sourceItemId: null },
        },
        {
          payload: {
            title: "Manual source",
            content: "Manual sources may omit an item identifier.",
            processStep: "plausibilityCheck",
            sourceRef: { type: "manual" },
          },
          expectedSource: { type: "manual", itemId: null },
          expectedStored: { sourceType: "manual", sourceItemId: null },
        },
        {
          payload: {
            title: "Nested source",
            content: "The HTTP object is flattened for storage.",
            processStep: "legalReview",
            sourceRef: { type: "materialNorm", itemId: "norm-test-42" },
          },
          expectedSource: { type: "materialNorm", itemId: "norm-test-42" },
          expectedStored: {
            sourceType: "materialNorm",
            sourceItemId: "norm-test-42",
          },
        },
      ] as const;

      try {
        const created = [];
        for (const scenario of cases) {
          const result = await createComment(projectId, scenario.payload);
          expect(result.body).toMatchObject({
            projectId: projectId,
            title: scenario.payload.title,
            content: scenario.payload.content,
            processStep: scenario.payload.processStep,
            sourceRef: scenario.expectedSource,
          });
          created.push({ ...result, expectedStored: scenario.expectedStored });
        }

        expect(new Set(created.map(({ body }) => body.id)).size).toBe(cases.length);
        const rows = await currentRows(projectId);
        expect(rows).toHaveLength(cases.length);
        for (const createdComment of created) {
          const row = rows.find(({ id }) => id === createdComment.body.id);
          expect(row).toMatchObject({
            id: createdComment.body.id,
            projectId,
            ...createdComment.expectedStored,
          });
        }
        expect(await historyRows(projectId)).toEqual([]);

        const audits = await auditRows(projectId);
        expect(audits).toHaveLength(cases.length);
        for (const createdComment of created) {
          expect(audits).toContainEqual(
            expect.objectContaining({
              projectId,
              entityId: createdComment.body.id,
              entityType: "comment",
              changeType: "create",
              actorUserId: createdComment.context.actorUserId,
              triggeredByUserId: createdComment.context.triggeredByUserId,
              workflowRunId: createdComment.context.workflowRunId,
              workflowType: createdComment.context.workflowType,
              requestStartTime: new Date(createdComment.context.requestStartTime),
              requestId: createdComment.context.requestId,
            }),
          );
        }
      } finally {
        await cleanupProject(projectId);
      }
    },
  );

  mutationTest("rejects invalid creates without current, history, or audit residue", async () => {
    const projectId = crypto.randomUUID();
    const cases = [
      {
        name: "empty title",
        payload: { title: "", content: "Body", processStep: "unsorted" },
        field: "title",
      },
      {
        name: "empty content",
        payload: { title: "Title", content: "", processStep: "unsorted" },
        field: "content",
      },
      {
        name: "unknown process step",
        payload: { title: "Title", content: "Body", processStep: "unknown" },
        field: "processStep",
      },
      {
        name: "missing referenced item",
        payload: {
          title: "Title",
          content: "Body",
          processStep: "unsorted",
          sourceRef: { type: "materialNorm" },
        },
        field: "sourceRef",
      },
    ] as const;

    try {
      for (const scenario of cases) {
        const context = requestContext();
        const response = await requestMutationJson("POST", collectionPath(projectId), {
          body: scenario.payload,
          headers: auditHeaders(context),
        });
        expect(response.status, scenario.name).toBe(422);
        const error = parseMutationContract(ValidationErrorResponseSchema, response.body);
        expect(error.detail.some(({ loc }) => loc.includes(scenario.field))).toBe(true);
      }
      expect(await currentRows(projectId)).toEqual([]);
      expect(await historyRows(projectId)).toEqual([]);
      expect(await auditRows(projectId)).toEqual([]);
    } finally {
      await cleanupProject(projectId);
    }
  });

  mutationTest("patches meaningful fields while an omitted source remains unchanged", async () => {
    const projectId = crypto.randomUUID();
    try {
      const created = await createComment(projectId, {
        title: "Before update",
        content: "Before content",
        processStep: "formalCompletenessCheck",
        sourceRef: { type: "tableOfContents", itemId: "toc-17" },
      });
      const updateContext = requestContext();
      const response = await requestMutationJson("PATCH", itemPath(projectId, created.body.id), {
        body: {
          title: "After update",
          content: "After content",
          processStep: "legalReview",
        },
        headers: auditHeaders(updateContext),
      });
      expect(response.status).toBe(200);
      const updated = parseMutationContract(CommentResponseSchema, response.body);
      expect(updated).toMatchObject({
        id: created.body.id,
        projectId: projectId,
        title: "After update",
        content: "After content",
        processStep: "legalReview",
        sourceRef: { type: "tableOfContents", itemId: "toc-17" },
      });

      expect(await currentRows(projectId)).toEqual([
        expect.objectContaining({
          id: created.body.id,
          title: "After update",
          content: "After content",
          processStep: "legalReview",
          sourceType: "tableOfContents",
          sourceItemId: "toc-17",
        }),
      ]);
      expect(await historyRows(projectId)).toEqual([
        expect.objectContaining({
          id: created.body.id,
          title: "Before update",
          content: "Before content",
          processStep: "formalCompletenessCheck",
          sourceType: "tableOfContents",
          sourceItemId: "toc-17",
        }),
      ]);
      expect(await auditRows(projectId)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            entityId: created.body.id,
            changeType: "create",
            requestId: created.context.requestId,
          }),
          expect.objectContaining({
            entityId: created.body.id,
            changeType: "update",
            requestId: updateContext.requestId,
          }),
        ]),
      );
    } finally {
      await cleanupProject(projectId);
    }
  });

  mutationTest(
    "treats an empty patch as a true no-op and explicit null as a source clear",
    async () => {
      const projectId = crypto.randomUUID();
      try {
        const created = await createComment(projectId, {
          title: "Source to clear",
          content: "Empty patch first",
          processStep: "materialCompletenessCheck",
          sourceRef: { type: "requiredDocuments", itemId: "required-9" },
        });
        const before = (await currentRows(projectId))[0];
        expect(before).toBeDefined();

        const emptyContext = requestContext();
        const emptyResponse = await requestMutationJson(
          "PATCH",
          itemPath(projectId, created.body.id),
          { body: {}, headers: auditHeaders(emptyContext) },
        );
        expect(emptyResponse.status).toBe(200);
        const unchanged = parseMutationContract(CommentResponseSchema, emptyResponse.body);
        expect(unchanged).toEqual(created.body);
        expect((await currentRows(projectId))[0]).toEqual(before!);
        expect(await historyRows(projectId)).toEqual([]);
        expect((await auditRows(projectId)).map(({ requestId }) => requestId)).not.toContain(
          emptyContext.requestId,
        );

        const clearContext = requestContext();
        const clearResponse = await requestMutationJson(
          "PATCH",
          itemPath(projectId, created.body.id),
          { body: { sourceRef: null }, headers: auditHeaders(clearContext) },
        );
        expect(clearResponse.status).toBe(200);
        const cleared = parseMutationContract(CommentResponseSchema, clearResponse.body);
        expect(cleared.sourceRef).toBeNull();
        expect(await currentRows(projectId)).toEqual([
          expect.objectContaining({
            id: created.body.id,
            sourceType: null,
            sourceItemId: null,
          }),
        ]);
        expect(await historyRows(projectId)).toEqual([
          expect.objectContaining({
            id: created.body.id,
            sourceType: "requiredDocuments",
            sourceItemId: "required-9",
          }),
        ]);
        expect(await auditRows(projectId)).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              changeType: "create",
              requestId: created.context.requestId,
            }),
            expect.objectContaining({
              changeType: "update",
              requestId: clearContext.requestId,
            }),
          ]),
        );
      } finally {
        await cleanupProject(projectId);
      }
    },
  );

  mutationTest(
    "patch validation, wrong-project, and not-found branches leave the comment untouched",
    async () => {
      const projectId = crypto.randomUUID();
      const wrongProjectId = crypto.randomUUID();
      try {
        const created = await createComment(projectId, {
          title: "Protected comment",
          content: "Invalid patches must not change this.",
          processStep: "unsorted",
        });
        const before = (await currentRows(projectId))[0];

        const invalid = await requestMutationJson("PATCH", itemPath(projectId, created.body.id), {
          body: { title: null },
          headers: auditHeaders(requestContext()),
        });
        expect(invalid.status).toBe(422);

        const missingCommentId = crypto.randomUUID();
        for (const path of [
          itemPath(wrongProjectId, created.body.id),
          itemPath(projectId, missingCommentId),
        ]) {
          const missing = await requestMutationJson("PATCH", path, {
            body: { title: "Must not apply" },
            headers: auditHeaders(requestContext()),
          });
          expect(missing.status).toBe(404);
          parseMutationContract(ErrorResponseSchema, missing.body);
        }

        expect((await currentRows(projectId))[0]).toEqual(before!);
        expect(await historyRows(projectId)).toEqual([]);
        expect(await auditRows(wrongProjectId)).toEqual([]);
        expect((await auditRows(projectId)).map(({ changeType }) => changeType)).toEqual([
          "create",
        ]);
      } finally {
        await cleanupProject(projectId);
        await cleanupProject(wrongProjectId);
      }
    },
  );

  mutationTest(
    "hard deletes a comment and commits its final history and audit observations",
    async () => {
      const projectId = crypto.randomUUID();
      try {
        const created = await createComment(projectId, {
          title: "Delete me",
          content: "This comment must leave current state only.",
          processStep: "plausibilityCheck",
          sourceRef: { type: "contradiction", itemId: "contradiction-88" },
        });
        const deleteContext = requestContext();
        const response = await deleteMutation(itemPath(projectId, created.body.id), {
          headers: auditHeaders(deleteContext),
        });
        expect(response).toEqual({ status: 204, body: "" });
        expect(await currentRows(projectId)).toEqual([]);
        expect(await historyRows(projectId)).toEqual([
          expect.objectContaining({
            id: created.body.id,
            projectId,
            title: "Delete me",
            sourceType: "contradiction",
            sourceItemId: "contradiction-88",
          }),
        ]);
        expect(await auditRows(projectId)).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              entityId: created.body.id,
              changeType: "create",
              requestId: created.context.requestId,
            }),
            expect.objectContaining({
              entityId: created.body.id,
              changeType: "delete",
              requestId: deleteContext.requestId,
            }),
          ]),
        );
      } finally {
        await cleanupProject(projectId);
      }
    },
  );

  mutationTest("wrong-project and not-found deletes are stable 404 no-ops", async () => {
    const projectId = crypto.randomUUID();
    const wrongProjectId = crypto.randomUUID();
    try {
      const created = await createComment(projectId, {
        title: "Do not delete",
        content: "Wrong identities cannot delete this row.",
        processStep: "legalReview",
      });
      const missingCommentId = crypto.randomUUID();
      for (const path of [
        itemPath(wrongProjectId, created.body.id),
        itemPath(projectId, missingCommentId),
      ]) {
        const response = await deleteMutation(path, {
          headers: auditHeaders(requestContext()),
        });
        expect(response.status).toBe(404);
        parseMutationContract(ErrorResponseSchema, JSON.parse(response.body));
      }
      expect(await currentRows(projectId)).toEqual([
        expect.objectContaining({ id: created.body.id, projectId }),
      ]);
      expect(await historyRows(projectId)).toEqual([]);
      expect((await auditRows(projectId)).map(({ changeType }) => changeType)).toEqual(["create"]);
      expect(await auditRows(wrongProjectId)).toEqual([]);
    } finally {
      await cleanupProject(projectId);
      await cleanupProject(wrongProjectId);
    }
  });

  mutationTest(
    "a real late audit denial rolls the flushed domain write back atomically",
    async () => {
      const projectId = crypto.randomUUID();
      const domainProbeId = crypto.randomUUID();
      const auditProbeId = crypto.randomUUID();
      try {
        expect(
          restrictedDatabase.transact(async () => {
            await restrictedDatabase.query(async (query) => {
              await query.insert(comments).values({
                id: domainProbeId,
                projectId,
                title: "Restricted-role domain probe",
                content: "This transaction is deliberately rolled back.",
                processStep: "unsorted",
                createdAt: new Date(),
                updatedAt: new Date(),
              });
            });
            throw new Error("rollback restricted domain probe");
          }),
        ).rejects.toThrow("rollback restricted domain probe");
        expect(await currentRows(projectId)).toEqual([]);

        expect(
          Promise.resolve(
            restrictedDatabase.query(async (query) =>
              query.insert(auditLogs).values({
                id: auditProbeId,
                projectId,
                entityId: domainProbeId,
                entityType: "comment",
                changeType: "create",
              }),
            ),
          ),
        ).rejects.toBeDefined();

        const context = requestContext();
        const response = await requestMutationJson("POST", collectionPath(projectId), {
          body: {
            title: "Atomic failure",
            content: "The domain flush succeeds before audit insertion is denied.",
            processStep: "unsorted",
          },
          headers: auditHeaders(context),
          target: "atomic-failure",
        });
        expect(response.status).toBe(500);
        expect(parseMutationContract(ErrorResponseSchema, response.body)).toEqual({
          detail: "Database operation failed",
        });

        expect(await currentRows(projectId)).toEqual([]);
        expect(await historyRows(projectId)).toEqual([]);
        expect(
          await database.query(async (query) =>
            query
              .select()
              .from(auditLogs)
              .where(
                and(eq(auditLogs.projectId, projectId), eq(auditLogs.requestId, context.requestId)),
              ),
          ),
        ).toEqual([]);
      } finally {
        await cleanupProject(projectId);
      }
    },
  );
});
