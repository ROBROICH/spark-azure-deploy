import {afterAll, beforeAll, describe, expect, test} from "bun:test";
import type {HttpJson} from "@spark-workflow/http-host";

import {assertProjectsAbsent, cleanupProjects, createMutationDatabase, readProjectState, seedReferences, type MutationDatabase, } from "../support/mutation-database.ts";
import {ErrorResponseSchema, parseMutationContract, SupplementaryRequestResponseSchema, } from "../support/mutation-contracts.ts";
import {mutateJson} from "../support/mutation-http.ts";

interface RequestContext {
  actorUserId: string;
  requestId: string;
  requestStartTime: string;
  triggeredByUserId: string;
  workflowRunId: string;
  workflowType: string;
}

const describeMutationTests =
  process.env.SUPPLEMENTARY_REQUESTS_BASE_URL === undefined ||
  process.env.SUPPLEMENTARY_REQUESTS_MUTATION_DATABASE_URL === undefined
    ? describe.skip
    : describe;

const collectionPath = (projectId: string) => `/projects/${projectId}/supplementary-requests`;
const itemPath = (projectId: string, requestId: string) =>
  `${collectionPath(projectId)}/${requestId}`;

function requestContext(): RequestContext {
  return {
    actorUserId: crypto.randomUUID(),
    requestId: crypto.randomUUID(),
    requestStartTime: new Date().toISOString(),
    triggeredByUserId: crypto.randomUUID(),
    workflowRunId: `supplementary-test-${crypto.randomUUID()}`,
    workflowType: "SupplementaryRequestsMutationTest",
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

async function createRequest(projectId: string, body: HttpJson, context?: RequestContext) {
  const response = await mutateJson("POST", collectionPath(projectId), {
    body,
    headers: context === undefined ? undefined : auditHeaders(context),
  });
  expect(response.status).toBe(201);
  return parseMutationContract(SupplementaryRequestResponseSchema, response.body);
}

async function expectDetailError(
  method: "POST" | "PATCH" | "DELETE",
  path: string,
  expectedStatus: number,
  expectedDetail: string | readonly string[],
  body?: HttpJson,
) {
  const response = await mutateJson(method, path, { body });
  expect(response.status).toBe(expectedStatus);
  const parsed = parseMutationContract(ErrorResponseSchema, response.body);
  const details = Array.isArray(expectedDetail) ? expectedDetail : [expectedDetail];
  if (Array.isArray(parsed.detail)) {
    expect(parsed.detail).not.toHaveLength(0);
  } else {
    expect(details).toContain(parsed.detail);
  }
}

describeMutationTests("Supplementary Requests HTTP mutation contract", () => {
  let database: MutationDatabase;

  beforeAll(async () => {
    database = createMutationDatabase();
    await database.ready();
  });

  afterAll(async () => {
    await database.close();
  });

  test("creates required, defaulted, null, referenced, and boundary variants", async () => {
    const projectId = crypto.randomUUID();
    const context = requestContext();
    const { topicId, documentId } = await seedReferences(database, projectId);

    try {
      const defaulted = await createRequest(
        projectId,
        {
          title: "Defaulted request",
          priority: "must",
        },
        context,
      );
      expect(defaulted).toMatchObject({
        projectId: projectId,
        title: "Defaulted request",
        reason: "",
        priority: "must",
        sourceRef: null,
        includedInLetter: false,
        topicId: null,
        documentId: null,
      });
      expect(defaulted.id).not.toBe(projectId);
      expect(Date.parse(defaulted.createdAt)).not.toBeNaN();
      expect(Date.parse(defaulted.updatedAt)).toBeGreaterThanOrEqual(
        Date.parse(defaulted.createdAt),
      );

      const explicitNull = await createRequest(projectId, {
        title: "Explicit null source",
        priority: "should",
        sourceRef: null,
      });
      expect(explicitNull.sourceRef).toBeNull();

      const referenced = await createRequest(projectId, {
        title: "Referenced request",
        reason: "Every optional public value is explicit.",
        priority: "should",
        sourceRef: { type: "materialNorm", itemId: "norm-source-42" },
        includedInLetter: true,
        topicId: topicId,
        documentId: documentId,
      });
      expect(referenced).toMatchObject({
        projectId: projectId,
        sourceRef: { type: "materialNorm", itemId: "norm-source-42" },
        includedInLetter: true,
        topicId: topicId,
        documentId: documentId,
      });

      const boundary = await createRequest(projectId, {
        title: "t".repeat(2_000),
        priority: "must",
      });
      expect(boundary.title).toHaveLength(2_000);

      const state = await readProjectState(database, projectId);
      expect(state.current).toHaveLength(4);
      expect(state.history).toEqual([]);
      expect(state.current.find(({ id }) => id === defaulted.id)).toMatchObject({
        reason: "",
        processStep: null,
        sourceType: null,
        sourceItemId: null,
        includedInLetter: false,
        topicId: null,
        documentId: null,
      });
      expect(state.current.find(({ id }) => id === referenced.id)).toMatchObject({
        sourceType: "materialNorm",
        sourceItemId: "norm-source-42",
        includedInLetter: true,
        topicId,
        documentId,
      });
      expect(state.audit).toHaveLength(4);
      expect(state.audit).toContainEqual(
        expect.objectContaining({
          projectId,
          entityId: defaulted.id,
          entityType: "supplementary_request",
          changeType: "create",
          actorUserId: context.actorUserId,
          triggeredByUserId: context.triggeredByUserId,
          workflowRunId: context.workflowRunId,
          workflowType: context.workflowType,
          requestStartTime: new Date(context.requestStartTime),
          requestId: context.requestId,
        }),
      );
    } finally {
      await cleanupProjects(database, [projectId]);
    }
    await assertProjectsAbsent(database, [projectId]);
  });

  test("rejects missing fields, source members, title bounds, and invalid priority without residue", async () => {
    const projectId = crypto.randomUUID();
    const cases = [
      { name: "missing title", body: { priority: "must" } },
      { name: "missing priority", body: { title: "Missing priority" } },
      { name: "empty title", body: { title: "", priority: "must" } },
      {
        name: "overlong title",
        body: { title: "t".repeat(2_001), priority: "must" },
      },
      {
        name: "invalid priority",
        body: { title: "Invalid priority", priority: "maybe" },
      },
      {
        name: "missing source type",
        body: {
          title: "Missing source type",
          priority: "must",
          sourceRef: { itemId: "source-1" },
        },
      },
      {
        name: "missing source item",
        body: {
          title: "Missing source item",
          priority: "must",
          sourceRef: { type: "manual" },
        },
      },
      {
        name: "empty source item",
        body: {
          title: "Empty source item",
          priority: "must",
          sourceRef: { type: "manual", itemId: "" },
        },
      },
    ] as const;

    try {
      for (const scenario of cases) {
        const response = await mutateJson("POST", collectionPath(projectId), {
          body: scenario.body,
        });
        expect(response.status, scenario.name).toBe(422);
        const error = parseMutationContract(ErrorResponseSchema, response.body);
        if (Array.isArray(error.detail)) {
          expect(error.detail, scenario.name).not.toHaveLength(0);
        } else {
          expect(error.detail, scenario.name).toBe("Invalid request payload");
        }
      }
      expect(await readProjectState(database, projectId)).toEqual({
        current: [],
        history: [],
        audit: [],
      });
    } finally {
      await cleanupProjects(database, [projectId]);
    }
    await assertProjectsAbsent(database, [projectId]);
  });

  test("scopes source bindings per project and rejects duplicate creates atomically", async () => {
    const projectId = crypto.randomUUID();
    const otherProjectId = crypto.randomUUID();
    const sourceRef = { type: "requiredDocuments", itemId: "required-42" };

    try {
      const original = await createRequest(projectId, {
        title: "Original binding",
        priority: "must",
        sourceRef: sourceRef,
      });
      await expectDetailError(
        "POST",
        collectionPath(projectId),
        409,
        "The change conflicts with existing data",
        { title: "Conflicting binding", priority: "should", sourceRef: sourceRef },
      );
      const other = await createRequest(otherProjectId, {
        title: "Same source in another project",
        priority: "should",
        sourceRef: sourceRef,
      });

      const primaryState = await readProjectState(database, projectId);
      expect(primaryState.current).toEqual([
        expect.objectContaining({ id: original.id, title: "Original binding" }),
      ]);
      expect(primaryState.history).toEqual([]);
      expect(primaryState.audit).toHaveLength(1);
      expect(primaryState.audit[0]).toMatchObject({
        entityId: original.id,
        changeType: "create",
      });
      expect((await readProjectState(database, otherProjectId)).current).toEqual([
        expect.objectContaining({ id: other.id }),
      ]);
    } finally {
      await cleanupProjects(database, [projectId, otherProjectId]);
    }
    await assertProjectsAbsent(database, [projectId, otherProjectId]);
  });

  test("distinguishes omitted updates, source replacement, explicit clearing, and rollback", async () => {
    const projectId = crypto.randomUUID();
    const { topicId: originalTopicId, documentId: originalDocumentId } = await seedReferences(
      database,
      projectId,
    );
    const { topicId: replacementTopicId, documentId: replacementDocumentId } =
      await seedReferences(database, projectId);

    try {
      const created = await createRequest(projectId, {
        title: "Original title",
        reason: "Original reason",
        priority: "must",
        sourceRef: { type: "materialLaw", itemId: "law-1" },
        includedInLetter: false,
        topicId: originalTopicId,
        documentId: originalDocumentId,
      });

      const omittedResponse = await mutateJson("PATCH", itemPath(projectId, created.id), {
        body: {},
      });
      expect(omittedResponse.status).toBe(200);
      const omitted = parseMutationContract(
        SupplementaryRequestResponseSchema,
        omittedResponse.body,
      );
      expect(omitted).toEqual(created);
      let state = await readProjectState(database, projectId);
      expect(state.history).toEqual([]);
      expect(state.audit.map(({ changeType }) => changeType).sort()).toEqual(["create", "update"]);

      const replacementResponse = await mutateJson("PATCH", itemPath(projectId, created.id), {
        body: {
          title: "Replacement title",
          reason: "Replacement reason",
          priority: "should",
          sourceRef: { type: "contradiction", itemId: "contradiction-2" },
          includedInLetter: true,
          topicId: replacementTopicId,
          documentId: replacementDocumentId,
        },
      });
      expect(replacementResponse.status).toBe(200);
      const replaced = parseMutationContract(
        SupplementaryRequestResponseSchema,
        replacementResponse.body,
      );
      expect(replaced).toMatchObject({
        id: created.id,
        title: "Replacement title",
        reason: "Replacement reason",
        priority: "should",
        sourceRef: { type: "contradiction", itemId: "contradiction-2" },
        includedInLetter: true,
        topicId: replacementTopicId,
        documentId: replacementDocumentId,
      });

      const clearResponse = await mutateJson("PATCH", itemPath(projectId, created.id), {
        body: { sourceRef: null, topicId: null, documentId: null },
      });
      expect(clearResponse.status).toBe(200);
      const cleared = parseMutationContract(SupplementaryRequestResponseSchema, clearResponse.body);
      expect(cleared).toMatchObject({
        id: created.id,
        title: "Replacement title",
        sourceRef: null,
        topicId: null,
        documentId: null,
      });

      state = await readProjectState(database, projectId);
      expect(state.current).toEqual([
        expect.objectContaining({
          id: created.id,
          sourceType: null,
          sourceItemId: null,
          topicId: null,
          documentId: null,
        }),
      ]);
      expect(state.history).toHaveLength(2);
      expect(state.history[0]).toMatchObject({
        title: "Original title",
        sourceType: "materialLaw",
        sourceItemId: "law-1",
        topicId: originalTopicId,
        documentId: originalDocumentId,
      });
      expect(state.history[1]).toMatchObject({
        title: "Replacement title",
        sourceType: "contradiction",
        sourceItemId: "contradiction-2",
        topicId: replacementTopicId,
        documentId: replacementDocumentId,
      });
      expect(state.audit).toHaveLength(4);

      const beforeRollback = state;
      await expectDetailError(
        "PATCH",
        itemPath(projectId, created.id),
        422,
        "Invalid request payload",
        { reason: null },
      );
      const afterRollback = await readProjectState(database, projectId);
      expect(afterRollback).toEqual(beforeRollback);
    } finally {
      await cleanupProjects(database, [projectId]);
    }
    await assertProjectsAbsent(database, [projectId]);
  });

  test("rejects duplicate replacement, malformed identity, wrong project, and not found without changes", async () => {
    const projectId = crypto.randomUUID();
    const wrongProjectId = crypto.randomUUID();
    const missingId = crypto.randomUUID();

    try {
      const first = await createRequest(projectId, {
        title: "First source",
        priority: "must",
        sourceRef: { type: "materialSatz", itemId: "satz-1" },
      });
      const second = await createRequest(projectId, {
        title: "Second source",
        priority: "should",
        sourceRef: { type: "materialSatz", itemId: "satz-2" },
      });
      const before = await readProjectState(database, projectId);

      await expectDetailError(
        "PATCH",
        itemPath(projectId, second.id),
        409,
        "The change conflicts with existing data",
        { sourceRef: { type: "materialSatz", itemId: "satz-1" } },
      );
      await expectDetailError(
        "PATCH",
        itemPath(projectId, "not-a-request-id"),
        422,
        "Invalid request payload",
        { title: "Never applied" },
      );
      await expectDetailError(
        "PATCH",
        itemPath(projectId, missingId),
        404,
        "Supplementary request not found",
        { title: "Never applied" },
      );
      await expectDetailError(
        "PATCH",
        itemPath(wrongProjectId, first.id),
        404,
        "Supplementary request not found",
        { title: "Never applied" },
      );

      expect(await readProjectState(database, projectId)).toEqual(before);
      expect(await readProjectState(database, wrongProjectId)).toEqual({
        current: [],
        history: [],
        audit: [],
      });
    } finally {
      await cleanupProjects(database, [projectId, wrongProjectId]);
    }
    await assertProjectsAbsent(database, [projectId, wrongProjectId]);
  });

  test("returns the deleted value, records history and audit, and preserves unrelated rows", async () => {
    const projectId = crypto.randomUUID();
    const otherProjectId = crypto.randomUUID();

    try {
      const target = await createRequest(projectId, {
        title: "Delete target",
        priority: "must",
      });
      const sameProjectSurvivor = await createRequest(projectId, {
        title: "Same-project survivor",
        priority: "should",
      });
      const otherProjectSurvivor = await createRequest(otherProjectId, {
        title: "Other-project survivor",
        priority: "must",
      });

      const response = await mutateJson("DELETE", itemPath(projectId, target.id));
      expect(response.status).toBe(200);
      expect(parseMutationContract(SupplementaryRequestResponseSchema, response.body)).toEqual(
        target,
      );

      const state = await readProjectState(database, projectId);
      expect(state.current).toEqual([expect.objectContaining({ id: sameProjectSurvivor.id })]);
      expect(state.history).toEqual([
        expect.objectContaining({ id: target.id, title: "Delete target" }),
      ]);
      expect(state.audit).toHaveLength(3);
      expect(state.audit).toContainEqual(
        expect.objectContaining({
          entityId: target.id,
          entityType: "supplementary_request",
          changeType: "delete",
        }),
      );
      expect((await readProjectState(database, otherProjectId)).current).toEqual([
        expect.objectContaining({ id: otherProjectSurvivor.id }),
      ]);

      await expectDetailError(
        "DELETE",
        itemPath(projectId, target.id),
        404,
        "Supplementary request not found",
      );
      await expectDetailError(
        "DELETE",
        itemPath(projectId, crypto.randomUUID()),
        404,
        "Supplementary request not found",
      );
      expect(await readProjectState(database, projectId)).toEqual(state);
    } finally {
      await cleanupProjects(database, [projectId, otherProjectId]);
    }
    await assertProjectsAbsent(database, [projectId, otherProjectId]);
  });
});
