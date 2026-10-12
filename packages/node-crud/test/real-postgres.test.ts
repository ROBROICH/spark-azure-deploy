import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { withAuditContext } from "@spark-workflow/audit-client";
import { auditLogs } from "@spark-workflow/audit-client/schema";
import { and, asc, eq, inArray } from "drizzle-orm";
import { isPlainObject } from "es-toolkit";

import { createRepresentativeApp } from "./fixtures/formal-completeness/app";
import type { NodeDatabase } from "../src";
import type { NodeJson } from "../src/values";
import {
  categories,
  categoryHistory,
  documentHistory,
  documents,
  documentTypeHistory,
  documentTypes,
  formalCompletenessSchema,
} from "./fixtures/formal-completeness/schema";
import { createNodeTestDatabase } from "./support/database";

const databaseUrl = process.env.NODE_CRUD_TEST_URL;
const realPostgres = databaseUrl ? describe : describe.skip;

const PROJECT = "10000000-0000-4000-8000-000000000001";
const STREAM_PROJECT = "10000000-0000-4000-8000-000000000005";
const ROLLBACK_PROJECT = "10000000-0000-4000-8000-000000000002";
const PERMISSION_PROJECT = "10000000-0000-4000-8000-000000000003";
const EMPTY_PATCH_PROJECT = "10000000-0000-4000-8000-000000000004";
const CLIENT_CATEGORY = "20000000-0000-4000-8000-000000000001";
const DELETE_CATEGORY = "20000000-0000-4000-8000-000000000002";
const PENDING_DOCUMENT_TYPE = "30000000-0000-4000-8000-000000000001";
const EXISTING_DOCUMENT_TYPE = "30000000-0000-4000-8000-000000000002";
const EMPTY_PATCH_DOCUMENT_TYPE = "30000000-0000-4000-8000-000000000005";
const EMPTY_PATCH_DELETE_CATEGORY = "20000000-0000-4000-8000-000000000006";
const DOCUMENT = "40000000-0000-4000-8000-000000000001";
const FILE = "50000000-0000-4000-8000-000000000001";
const EXTRACTION = "50000000-0000-4000-8000-000000000002";
const ACTOR = "60000000-0000-4000-8000-000000000001";
const REQUEST = "60000000-0000-4000-8000-000000000002";

type App = ReturnType<typeof createRepresentativeApp>;

const request = async (app: App, method: "GET" | "POST", path: string, body?: NodeJson) => {
  const headers = new Headers();
  const init: RequestInit = { method, headers };
  if (body !== undefined) {
    headers.set("content-type", "application/json");
    init.body = JSON.stringify(body);
  }
  const response = await withAuditContext(
    { actorUserId: ACTOR, requestId: REQUEST, requestStartTime: "2026-07-16T08:09:10.123Z" },
    () => app.handle(new Request(`http://node-crud.test${path}`, init)),
  );
  const text = await response.text();
  return {
    status: response.status,
    body: response.headers.get("content-type")?.startsWith("application/json")
      ? JSON.parse(text)
      : text,
  };
};

const replaceDynamicValues = (
  value: NodeJson | undefined,
  ids: ReadonlyMap<string, string>,
): unknown => {
  if (value === undefined) return value;
  if (Array.isArray(value)) {
    return value.map((item) => replaceDynamicValues(item, ids));
  }
  if (!isPlainObject(value)) {
    return ids.get(`${value}`) ?? value;
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      key === "created_at" || key === "updated_at"
        ? "<timestamp>"
        : key === "sys_period"
          ? "<sys-period>"
          : replaceDynamicValues(item, ids),
    ]),
  );
};

realPostgres("node CRUD invariant tracer against Formal Completeness", () => {
  let database: NodeDatabase<typeof formalCompletenessSchema>;
  let closeDatabase: () => Promise<void>;
  let app: App;
  let deniedApp: App;

  beforeAll(async () => {
    const testDatabase = await createNodeTestDatabase(databaseUrl!, formalCompletenessSchema);
    database = testDatabase.database;
    closeDatabase = testDatabase.close;
    app = createRepresentativeApp(testDatabase.persistence, {
      allowedFieldPermissions: new Set(["create", "update"]),
    });
    deniedApp = createRepresentativeApp(testDatabase.persistence, {
      allowedFieldPermissions: new Set(),
    });
  });

  afterAll(async () => {
    const projects = [
      PROJECT,
      STREAM_PROJECT,
      ROLLBACK_PROJECT,
      PERMISSION_PROJECT,
      EMPTY_PATCH_PROJECT,
    ];
    await database.delete(documents).where(inArray(documents.projectId, projects));
    await database.delete(documentTypes).where(inArray(documentTypes.projectId, projects));
    await database.delete(categories).where(inArray(categories.projectId, projects));
    await database.delete(documentHistory).where(inArray(documentHistory.projectId, projects));
    await database
      .delete(documentTypeHistory)
      .where(inArray(documentTypeHistory.projectId, projects));
    await database.delete(categoryHistory).where(inArray(categoryHistory.projectId, projects));
    await database.delete(auditLogs).where(inArray(auditLogs.projectId, projects));
    await closeDatabase();
  });

  test("returns an empty node list from PostgreSQL", async () => {
    expect(await request(app, "GET", `/${STREAM_PROJECT}/nodes?projectVersion=1`)).toEqual({
      status: 200,
      body: { nodes: [] },
    });
  });

  test("runs reads and one atomic mixed mutation through named HTTP routes", async () => {
    const seededAt = new Date("2026-07-16T07:00:00.000Z");
    await database.insert(categories).values({
      id: DELETE_CATEGORY,
      projectId: PROJECT,
      projectVersion: 1,
      createdAt: seededAt,
      updatedAt: seededAt,
      isDeleted: false,
      name: "Delete me",
    } as never);
    await database.insert(documentTypes).values({
      id: EXISTING_DOCUMENT_TYPE,
      projectId: PROJECT,
      projectVersion: 1,
      createdAt: seededAt,
      updatedAt: seededAt,
      isDeleted: false,
      categoryId: null,
      name: "Existing type",
      description: "description must remain",
      confidence: 0.9,
      isResolved: false,
      origin: "system",
    } as never);

    const mutation = await request(app, "POST", `/${PROJECT}/update?projectVersion=1`, {
      inserts: [
        {
          nodeType: "category",
          id: CLIENT_CATEGORY,
          payload: {
            name: "Client category",
            frontendParentIds: ["outline-root"],
            updateType: "manual",
          },
        },
        {
          nodeType: "category",
          payload: { name: "Generated category" },
        },
        {
          nodeType: "document_type",
          id: PENDING_DOCUMENT_TYPE,
          payload: {
            categoryId: CLIENT_CATEGORY,
            name: "Pending-parent type",
            description: "typed description",
            confidence: 0.75,
            isResolved: false,
            origin: "custom",
          },
        },
        {
          nodeType: "document",
          id: DOCUMENT,
          payload: {
            fileId: FILE,
            contentExtractionId: EXTRACTION,
            aiSuggestedRequiredDocumentTypeId: PENDING_DOCUMENT_TYPE,
            humanRequiredDocumentTypeId: null,
            documentName: "Fixture.pdf",
            reasoning: null,
            confidence: 0.88,
            isOutdated: true,
            frontendParentIds: ["frontend-document"],
          },
        },
      ],
      updates: [
        {
          nodeType: "document_type",
          id: EXISTING_DOCUMENT_TYPE,
          payload: { confidence: null },
        },
      ],
      deletes: [{ nodeType: "category", id: DELETE_CATEGORY }],
    });
    expect(mutation.status).toBe(200);
    const mutationBody = mutation.body as {
      inserted: Array<{ nodeType: string; id: string }>;
      updated: Array<{ id: string; description: string; confidence: number | null }>;
      deleted: unknown;
    };
    const inserted = mutationBody.inserted;
    expect(inserted.map(({ nodeType }) => nodeType)).toEqual([
      "category",
      "category",
      "document_type",
      "document",
    ]);
    const generatedCategory = `${inserted[1]!.id}`;
    expect(generatedCategory).toMatch(/^[0-9a-f-]{36}$/);
    expect(mutationBody.updated[0]).toMatchObject({
      id: EXISTING_DOCUMENT_TYPE,
      description: "description must remain",
      confidence: null,
    });
    expect(mutationBody.deleted).toEqual([{ nodeType: "category", id: DELETE_CATEGORY }]);

    const labels = new Map([
      [CLIENT_CATEGORY, "<client-category>"],
      [generatedCategory, "<generated-category>"],
      [PENDING_DOCUMENT_TYPE, "<pending-document-type>"],
      [EXISTING_DOCUMENT_TYPE, "<existing-document-type>"],
      [DOCUMENT, "<document>"],
      [FILE, "<file>"],
      [EXTRACTION, "<extraction>"],
    ]);
    const explicit = await request(app, "GET", `/${PROJECT}/nodes?projectVersion=1`);
    const latest = await request(app, "GET", `/${PROJECT}/nodes`);
    expect(explicit.status).toBe(200);
    expect(latest).toEqual(explicit);
    const listedNodes = (explicit.body as { nodes: Array<{ nodeType: string; id: string }> }).nodes;
    for (const expectedType of ["category", "document", "document_type"]) {
      const ids = listedNodes
        .filter((node) => node.nodeType === expectedType)
        .map(({ id }) => `${id}`);
      expect(ids).toEqual([...ids].sort());
    }
    const normalizedList = replaceDynamicValues(explicit.body, labels) as {
      nodes: Array<{ nodeType: string; id: string }>;
    };
    const nodeTypeOrder = new Map([
      ["category", 0],
      ["document", 1],
      ["document_type", 2],
    ]);
    normalizedList.nodes.sort((left, right) => {
      const leftNodeType = `${left.nodeType}`;
      const rightNodeType = `${right.nodeType}`;
      const typeDifference = nodeTypeOrder.get(leftNodeType)! - nodeTypeOrder.get(rightNodeType)!;
      if (typeDifference !== 0) return typeDifference;
      return leftNodeType === "category" ? `${left.id}`.localeCompare(`${right.id}`) : 0;
    });
    expect(normalizedList).toMatchInlineSnapshot(`
      {
        "nodes": [
          {
            "frontendParentIds": [
              "outline-root",
            ],
            "id": "<client-category>",
            "isOutdated": false,
            "nodeType": "category",
            "parents": [],
          },
          {
            "frontendParentIds": [],
            "id": "<generated-category>",
            "isOutdated": false,
            "nodeType": "category",
            "parents": [],
          },
          {
            "frontendParentIds": [
              "frontend-document",
            ],
            "id": "<document>",
            "isOutdated": true,
            "nodeType": "document",
            "parents": [
              {
                "id": "<pending-document-type>",
                "nodeType": "document_type",
              },
              {
                "id": "<file>",
                "nodeType": "file",
              },
              {
                "id": "<extraction>",
                "nodeType": "file",
              },
            ],
          },
          {
            "frontendParentIds": [],
            "id": "<pending-document-type>",
            "isOutdated": false,
            "nodeType": "document_type",
            "parents": [
              {
                "id": "<client-category>",
                "nodeType": "category",
              },
            ],
          },
          {
            "frontendParentIds": [],
            "id": "<existing-document-type>",
            "isOutdated": false,
            "nodeType": "document_type",
            "parents": [],
          },
        ],
      }
    `);

    const batch = await request(app, "POST", `/${PROJECT}/batch-nodes`, {
      nodes: [
        { nodeType: "document", id: DOCUMENT },
        { nodeType: "category", id: CLIENT_CATEGORY },
        { nodeType: "document_type", id: EXISTING_DOCUMENT_TYPE },
      ],
    });
    expect(batch.status).toBe(200);
    const batchResults = (
      batch.body as {
        results: Array<{
          nodeType: string;
          id: string;
          description?: string | null;
          confidence?: number | null;
          updateType?: string;
        }>;
      }
    ).results;
    expect(
      batchResults.map(({ nodeType, id, description, confidence, updateType }) => ({
        nodeType,
        id: labels.get(`${id}`),
        description,
        confidence,
        updateType,
      })),
    ).toMatchInlineSnapshot(`
      [
        {
          "confidence": 0.88,
          "description": undefined,
          "id": "<document>",
          "nodeType": "document",
          "updateType": "automated",
        },
        {
          "confidence": undefined,
          "description": undefined,
          "id": "<client-category>",
          "nodeType": "category",
          "updateType": "manual",
        },
        {
          "confidence": null,
          "description": "description must remain",
          "id": "<existing-document-type>",
          "nodeType": "document_type",
          "updateType": "automated",
        },
      ]
    `);

    const persisted = await database
      .select()
      .from(documentTypes)
      .where(eq(documentTypes.id, EXISTING_DOCUMENT_TYPE));
    expect(persisted[0]).toMatchObject({
      description: "description must remain",
      confidence: null,
    });
    expect(
      await database
        .select({ id: categories.id })
        .from(categories)
        .where(eq(categories.id, DELETE_CATEGORY)),
    ).toEqual([{ id: DELETE_CATEGORY }]);
    expect(
      await database
        .select({ isDeleted: categories.isDeleted })
        .from(categories)
        .where(eq(categories.id, DELETE_CATEGORY)),
    ).toEqual([{ isDeleted: true }]);

    const auditRows = await database
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.projectId, PROJECT))
      .orderBy(asc(auditLogs.entityType), asc(auditLogs.entityId));
    expect(auditRows).toHaveLength(6);
    expect(
      auditRows.map(({ entityType, entityId, changeType, actorUserId, requestId }) => ({
        entityType,
        entityId: labels.get(String(entityId)) ?? entityId,
        changeType,
        actorUserId,
        requestId,
      })),
    ).toEqual(
      expect.arrayContaining([
        {
          entityType: "document_type",
          entityId: "<existing-document-type>",
          changeType: "update",
          actorUserId: ACTOR,
          requestId: null,
        },
        {
          entityType: "category",
          entityId: DELETE_CATEGORY,
          changeType: "delete",
          actorUserId: ACTOR,
          requestId: null,
        },
      ]),
    );
    expect(
      await database
        .select({ id: documentTypeHistory.id })
        .from(documentTypeHistory)
        .where(eq(documentTypeHistory.id, EXISTING_DOCUMENT_TYPE)),
    ).toHaveLength(1);
    expect(
      await database
        .select({ id: categoryHistory.id })
        .from(categoryHistory)
        .where(eq(categoryHistory.id, DELETE_CATEGORY)),
    ).toHaveLength(1);
  });

  test("rejects duplicate targets and field permissions before persistence", async () => {
    const duplicate = await request(app, "POST", `/${PERMISSION_PROJECT}/update?projectVersion=1`, {
      updates: [
        {
          nodeType: "category",
          id: CLIENT_CATEGORY,
          payload: { name: "not written" },
        },
      ],
      deletes: [{ nodeType: "category", id: CLIENT_CATEGORY }],
    });
    expect(duplicate).toEqual({
      status: 400,
      body: "Same node targeted by multiple mutation kinds: category:20000000-0000-4000-8000-000000000001",
    });

    const deniedId = "30000000-0000-4000-8000-000000000003";
    const denied = await request(
      deniedApp,
      "POST",
      `/${PERMISSION_PROJECT}/update?projectVersion=1`,
      {
        inserts: [
          {
            nodeType: "document_type",
            id: deniedId,
            payload: {
              categoryId: null,
              name: "Denied",
              description: "requires create permission",
              confidence: null,
              isResolved: false,
              origin: "custom",
            },
          },
        ],
      },
    );
    expect(denied).toEqual({
      status: 403,
      body: { detail: "Permission denied" },
    });
    expect(
      await database
        .select({ id: documentTypes.id })
        .from(documentTypes)
        .where(eq(documentTypes.id, deniedId)),
    ).toEqual([]);
    expect(
      await database
        .select({ id: auditLogs.id })
        .from(auditLogs)
        .where(eq(auditLogs.projectId, PERMISSION_PROJECT)),
    ).toEqual([]);
  });

  test("keeps empty updates out of results, persistence, history, audit, and conflicts", async () => {
    const seededAt = new Date("2026-07-16T07:45:00.000Z");
    await database.insert(documentTypes).values({
      id: EMPTY_PATCH_DOCUMENT_TYPE,
      projectId: EMPTY_PATCH_PROJECT,
      projectVersion: 1,
      createdAt: seededAt,
      updatedAt: seededAt,
      isDeleted: false,
      categoryId: null,
      name: "Empty patch target",
      description: "must remain unchanged",
      confidence: null,
      isResolved: false,
      origin: "system",
    } as never);
    await database.insert(categories).values({
      id: EMPTY_PATCH_DELETE_CATEGORY,
      projectId: EMPTY_PATCH_PROJECT,
      projectVersion: 1,
      createdAt: seededAt,
      updatedAt: seededAt,
      isDeleted: false,
      name: "Delete despite empty patch",
    } as never);

    const noOp = await request(app, "POST", `/${EMPTY_PATCH_PROJECT}/update?projectVersion=1`, {
      updates: [
        {
          nodeType: "document_type",
          id: EMPTY_PATCH_DOCUMENT_TYPE,
          payload: {},
        },
      ],
    });
    expect(noOp).toEqual({
      status: 200,
      body: { inserted: [], updated: [], deleted: [] },
    });
    expect(
      await database
        .select({ updatedAt: documentTypes.updatedAt })
        .from(documentTypes)
        .where(eq(documentTypes.id, EMPTY_PATCH_DOCUMENT_TYPE)),
    ).toEqual([{ updatedAt: seededAt }]);
    expect(
      await database
        .select({ id: documentTypeHistory.id })
        .from(documentTypeHistory)
        .where(eq(documentTypeHistory.id, EMPTY_PATCH_DOCUMENT_TYPE)),
    ).toEqual([]);
    expect(
      await database
        .select({ id: auditLogs.id })
        .from(auditLogs)
        .where(eq(auditLogs.entityId, EMPTY_PATCH_DOCUMENT_TYPE)),
    ).toEqual([]);

    const deleteDespiteEmptyPatch = await request(
      app,
      "POST",
      `/${EMPTY_PATCH_PROJECT}/update?projectVersion=1`,
      {
        updates: [
          {
            nodeType: "category",
            id: EMPTY_PATCH_DELETE_CATEGORY,
            payload: {},
          },
        ],
        deletes: [
          {
            nodeType: "category",
            id: EMPTY_PATCH_DELETE_CATEGORY,
          },
        ],
      },
    );
    expect(deleteDespiteEmptyPatch).toEqual({
      status: 200,
      body: {
        inserted: [],
        updated: [],
        deleted: [
          {
            nodeType: "category",
            id: EMPTY_PATCH_DELETE_CATEGORY,
          },
        ],
      },
    });
    expect(
      await database
        .select({ isDeleted: categories.isDeleted })
        .from(categories)
        .where(eq(categories.id, EMPTY_PATCH_DELETE_CATEGORY)),
    ).toEqual([{ isDeleted: true }]);
    expect(
      await database
        .select({ id: categoryHistory.id })
        .from(categoryHistory)
        .where(eq(categoryHistory.id, EMPTY_PATCH_DELETE_CATEGORY)),
    ).toHaveLength(1);
    expect(
      await database
        .select({ changeType: auditLogs.changeType })
        .from(auditLogs)
        .where(eq(auditLogs.entityId, EMPTY_PATCH_DELETE_CATEGORY)),
    ).toEqual([{ changeType: "delete" }]);
  });

  test("rolls back domain, history, and audit state on mixed failures", async () => {
    const rollbackType = "30000000-0000-4000-8000-000000000004";
    const missingCategory = "20000000-0000-4000-8000-000000000004";
    const transientCategory = "20000000-0000-4000-8000-000000000005";
    const seededAt = new Date("2026-07-16T07:30:00.000Z");
    await database.insert(documentTypes).values({
      id: rollbackType,
      projectId: ROLLBACK_PROJECT,
      projectVersion: 1,
      createdAt: seededAt,
      updatedAt: seededAt,
      isDeleted: false,
      categoryId: null,
      name: "Rollback type",
      description: "original",
      confidence: 0.5,
      isResolved: false,
      origin: "system",
    } as never);

    const missingDelete = await request(
      app,
      "POST",
      `/${ROLLBACK_PROJECT}/update?projectVersion=1`,
      {
        updates: [
          {
            nodeType: "document_type",
            id: rollbackType,
            payload: { description: "must roll back" },
          },
        ],
        deletes: [{ nodeType: "category", id: missingCategory }],
      },
    );
    expect(missingDelete).toEqual({
      status: 404,
      body: "Delete batch affected fewer rows than expected",
    });
    expect(
      await database
        .select({ description: documentTypes.description })
        .from(documentTypes)
        .where(eq(documentTypes.id, rollbackType)),
    ).toEqual([{ description: "original" }]);
    expect(
      await database
        .select({ id: documentTypeHistory.id })
        .from(documentTypeHistory)
        .where(eq(documentTypeHistory.id, rollbackType)),
    ).toEqual([]);

    const invalidParent = await request(
      app,
      "POST",
      `/${ROLLBACK_PROJECT}/update?projectVersion=1`,
      {
        inserts: [
          {
            nodeType: "category",
            id: transientCategory,
            payload: { name: "must roll back" },
          },
          {
            nodeType: "document_type",
            payload: {
              categoryId: missingCategory,
              name: "Invalid parent",
              description: "must roll back",
              confidence: null,
              isResolved: false,
              origin: "custom",
            },
          },
        ],
      },
    );
    expect(invalidParent).toEqual({
      status: 409,
      body: {
        detail: "PostgreSQL foreign key constraint violation",
      },
    });
    expect(
      await database
        .select({ id: categories.id })
        .from(categories)
        .where(eq(categories.id, transientCategory)),
    ).toEqual([]);
    expect(
      await database
        .select({ id: auditLogs.id })
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.projectId, ROLLBACK_PROJECT),
            inArray(auditLogs.entityId, [rollbackType, transientCategory]),
          ),
        ),
    ).toEqual([]);
  });
});
