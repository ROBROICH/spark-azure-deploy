import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { auditLogs } from "@spark-workflow/audit-client/schema";
import { and, asc, eq, inArray } from "drizzle-orm";

import type { NodeDatabase, NodePersistence } from "../src";
import type { NodeJson } from "../src/values";
import { createVersionOperationsApp } from "./fixtures/version-operations/app";
import { createProjectLogicClient } from "./fixtures/version-operations/project-logic-client";
import { startProjectLogicFake } from "./fixtures/version-operations/project-logic-fake";
import { createNodeTestDatabase } from "./support/database";
import {
  categories,
  categoryHistory,
  documentHistory,
  documents,
  documentTypeHistory,
  documentTypes,
  formalCompletenessSchema,
} from "./fixtures/formal-completeness/schema";

const databaseUrl = process.env.NODE_CRUD_VERSION_TEST_URL;
const realPostgres = databaseUrl ? describe : describe.skip;

const COPY_PROJECT = "11000000-0000-4000-8000-000000000001";
const PARTIAL_PROJECT = "11000000-0000-4000-8000-000000000002";
const MISSING_PROJECT = "11000000-0000-4000-8000-000000000003";
const ROLLBACK_PROJECT = "11000000-0000-4000-8000-000000000004";
const PEER_PROJECT = "11000000-0000-4000-8000-000000000005";
const PROJECTS = [
  COPY_PROJECT,
  PARTIAL_PROJECT,
  MISSING_PROJECT,
  ROLLBACK_PROJECT,
  PEER_PROJECT,
] as const;

const COPY_CATEGORY = "21000000-0000-4000-8000-000000000001";
const COPY_TYPE = "31000000-0000-4000-8000-000000000001";
const COPY_DOCUMENT = "41000000-0000-4000-8000-000000000001";
const COPY_OTHER_VERSION = "21000000-0000-4000-8000-000000000002";
const PARTIAL_CATEGORY = "22000000-0000-4000-8000-000000000001";
const PARTIAL_TYPE = "32000000-0000-4000-8000-000000000001";
const MISSING_CATEGORY = "23000000-0000-4000-8000-000000000001";
const ROLLBACK_CATEGORY = "24000000-0000-4000-8000-000000000001";
const ROLLBACK_TYPE = "34000000-0000-4000-8000-000000000001";
const PEER_CATEGORY = "25000000-0000-4000-8000-000000000001";
const FILE = "51000000-0000-4000-8000-000000000001";
const ACTOR = "61000000-0000-4000-8000-000000000001";
const REQUEST = "61000000-0000-4000-8000-000000000002";

type Database = NodeDatabase<typeof formalCompletenessSchema>;
type Persistence = NodePersistence<typeof formalCompletenessSchema>;
type App = ReturnType<typeof createVersionOperationsApp>;

const post = async (app: App, path: string, body: NodeJson) => {
  const response = await app.handle(
    new Request(`http://node-version.test${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "X-Actor-User-Id": ACTOR,
        "X-Request-Id": REQUEST,
        "X-Request-Starttime": "2026-07-16T08:09:10.123Z",
      },
      body: JSON.stringify(body),
    }),
  );
  const text = await response.text();
  return {
    status: response.status,
    body: response.headers.get("content-type")?.includes("application/json")
      ? JSON.parse(text)
      : text,
  };
};

const seedCategory = async (
  database: Database,
  projectId: string,
  id: string,
  projectVersion: number,
  name: string,
  isDeleted = false,
) => {
  const at = new Date("2026-07-16T07:00:00.000Z");
  await database.insert(categories).values({
    id,
    projectId: projectId,
    projectVersion: projectVersion,
    createdAt: at,
    updatedAt: at,
    isDeleted: isDeleted,
    name,
  } as never);
};

const seedDocumentType = async (
  database: Database,
  projectId: string,
  id: string,
  categoryId: string,
  projectVersion: number,
) => {
  const at = new Date("2026-07-16T07:00:00.000Z");
  await database.insert(documentTypes).values({
    id,
    projectId: projectId,
    projectVersion: projectVersion,
    createdAt: at,
    updatedAt: at,
    isDeleted: false,
    categoryId: categoryId,
    name: `Document type ${id}`,
    description: "source description",
    confidence: 0.8,
    isResolved: false,
    origin: "system",
  } as never);
};

realPostgres("node project-version operations against Formal Completeness", () => {
  let database: Database;
  let persistence: Persistence;
  let closeDatabase: () => Promise<void>;

  beforeAll(async () => {
    const testDatabase = await createNodeTestDatabase(databaseUrl!, formalCompletenessSchema);
    database = testDatabase.database;
    persistence = testDatabase.persistence;
    closeDatabase = testDatabase.close;
  });

  afterAll(async () => {
    await database.delete(documents).where(inArray(documents.projectId, PROJECTS));
    await database.delete(documentTypes).where(inArray(documentTypes.projectId, PROJECTS));
    await database.delete(categories).where(inArray(categories.projectId, PROJECTS));
    await database.delete(documentHistory).where(inArray(documentHistory.projectId, PROJECTS));
    await database
      .delete(documentTypeHistory)
      .where(inArray(documentTypeHistory.projectId, PROJECTS));
    await database.delete(categoryHistory).where(inArray(categoryHistory.projectId, PROJECTS));
    await database.delete(auditLogs).where(inArray(auditLogs.projectId, PROJECTS));
    await closeDatabase();
  });

  test("keeps dry-run and commit counts aligned, then undoes only the failed target", async () => {
    await seedCategory(database, COPY_PROJECT, COPY_CATEGORY, 1, "Source category");
    await seedDocumentType(database, COPY_PROJECT, COPY_TYPE, COPY_CATEGORY, 1);
    const at = new Date("2026-07-16T07:00:00.000Z");
    await database.insert(documents).values({
      id: COPY_DOCUMENT,
      projectId: COPY_PROJECT,
      projectVersion: 1,
      createdAt: at,
      updatedAt: at,
      isDeleted: false,
      fileId: FILE,
      contentExtractionId: null,
      aiSuggestedRequiredDocumentTypeId: COPY_TYPE,
      humanRequiredDocumentTypeId: null,
      documentName: "Source.pdf",
      reasoning: null,
      confidence: 0.9,
    } as never);
    await seedCategory(database, COPY_PROJECT, COPY_OTHER_VERSION, 3, "Must survive undo");

    const lock = {
      operation: "validate-version-lock" as const,
      projectId: COPY_PROJECT,
      input: {
        sourceVersion: 1,
        targetVersion: 2,
        lockToken: "copy-lock",
      },
      result: { status: 204 as const },
    };
    const fake = startProjectLogicFake([
      lock,
      lock,
      lock,
      lock,
      {
        operation: "latest-version",
        projectId: COPY_PROJECT,
        result: {
          status: 200,
          body: { projectId: COPY_PROJECT, latestVersion: 1 },
        },
      },
      {
        operation: "validate-version-lock",
        projectId: COPY_PROJECT,
        input: {
          sourceVersion: 1,
          targetVersion: 2,
          lockToken: "copy-lock",
        },
        result: { status: 204 },
      },
    ]);
    try {
      const app = createVersionOperationsApp(persistence, createProjectLogicClient(fake.url));
      const copyBody = {
        sourceVersion: 1,
        targetVersion: 2,
        lockToken: "copy-lock",
        nodes: [
          {
            nodeType: "document",
            id: COPY_DOCUMENT,
            setOutdated: true,
            overrides: { documentName: "Renamed.pdf" },
          },
          {
            nodeType: "document_type",
            id: COPY_TYPE,
            overrides: { confidence: null },
          },
          {
            nodeType: "category",
            id: COPY_CATEGORY,
            overrides: { name: "Renamed category", updateType: "manual" },
          },
        ],
      };

      expect(
        await post(app, `/${COPY_PROJECT}/copy-version`, {
          sourceVersion: 1,
          targetVersion: 2,
          lockToken: "copy-lock",
          dryRun: true,
        }),
      ).toEqual({ status: 200, body: { dryRun: true, copied: 0 } });
      expect(
        await post(app, `/${COPY_PROJECT}/copy-version`, { ...copyBody, dryRun: true }),
      ).toEqual({ status: 200, body: { dryRun: true, copied: 3 } });
      expect(
        await database
          .select({ id: categories.id })
          .from(categories)
          .where(and(eq(categories.projectId, COPY_PROJECT), eq(categories.projectVersion, 2))),
      ).toEqual([]);
      expect(
        await database
          .select({ id: auditLogs.id })
          .from(auditLogs)
          .where(eq(auditLogs.projectId, COPY_PROJECT)),
      ).toEqual([]);

      expect(
        await post(app, `/${COPY_PROJECT}/copy-version`, { ...copyBody, dryRun: false }),
      ).toEqual({ status: 200, body: { dryRun: false, copied: 3 } });
      expect(
        await database
          .select({
            name: categories.name,
            isOutdated: categories.isOutdated,
            updateType: categories.updateType,
          })
          .from(categories)
          .where(and(eq(categories.id, COPY_CATEGORY), eq(categories.projectVersion, 2))),
      ).toEqual([{ name: "Renamed category", isOutdated: false, updateType: "MANUAL" }]);
      expect(
        await database
          .select({ categoryId: documentTypes.categoryId, confidence: documentTypes.confidence })
          .from(documentTypes)
          .where(and(eq(documentTypes.id, COPY_TYPE), eq(documentTypes.projectVersion, 2))),
      ).toEqual([{ categoryId: COPY_CATEGORY, confidence: null }]);
      expect(
        await database
          .select({ documentName: documents.documentName, isOutdated: documents.isOutdated })
          .from(documents)
          .where(and(eq(documents.id, COPY_DOCUMENT), eq(documents.projectVersion, 2))),
      ).toEqual([{ documentName: "Renamed.pdf", isOutdated: true }]);

      expect(
        await database
          .select({ id: auditLogs.id })
          .from(auditLogs)
          .where(eq(auditLogs.projectId, COPY_PROJECT)),
      ).toEqual([]);
      expect(
        await database
          .select({ id: categoryHistory.id })
          .from(categoryHistory)
          .where(
            and(eq(categoryHistory.projectId, COPY_PROJECT), eq(categoryHistory.projectVersion, 2)),
          ),
      ).toEqual([]);

      expect(
        await post(app, `/${COPY_PROJECT}/copy-version`, { ...copyBody, dryRun: false }),
      ).toEqual({ status: 200, body: { dryRun: false, copied: 3 } });
      expect(
        await database
          .select({ id: auditLogs.id })
          .from(auditLogs)
          .where(eq(auditLogs.projectId, COPY_PROJECT)),
      ).toEqual([]);

      expect(
        await post(app, `/${COPY_PROJECT}/undo-version`, {
          targetVersion: 2,
          lockToken: "copy-lock",
        }),
      ).toEqual({
        status: 200,
        body: { deleted: { category: 1, document: 1, document_type: 1 } },
      });
      expect(
        await database
          .select({ version: categories.projectVersion })
          .from(categories)
          .where(eq(categories.projectId, COPY_PROJECT))
          .orderBy(asc(categories.projectVersion)),
      ).toEqual([{ version: 1 }, { version: 3 }]);
      expect(
        await database
          .select({ version: documentTypes.projectVersion })
          .from(documentTypes)
          .where(eq(documentTypes.projectId, COPY_PROJECT)),
      ).toEqual([{ version: 1 }]);
      expect(
        await database
          .select({ version: documents.projectVersion })
          .from(documents)
          .where(eq(documents.projectId, COPY_PROJECT)),
      ).toEqual([{ version: 1 }]);
      const versionAudit = await database
        .select({ id: auditLogs.id })
        .from(auditLogs)
        .where(eq(auditLogs.projectId, COPY_PROJECT));
      expect(versionAudit).toEqual([]);
      expect(
        await database
          .select({ id: categoryHistory.id })
          .from(categoryHistory)
          .where(
            and(eq(categoryHistory.projectId, COPY_PROJECT), eq(categoryHistory.projectVersion, 2)),
          ),
      ).toHaveLength(1);
      expect(
        await database
          .select({ id: documentTypeHistory.id })
          .from(documentTypeHistory)
          .where(
            and(
              eq(documentTypeHistory.projectId, COPY_PROJECT),
              eq(documentTypeHistory.projectVersion, 2),
            ),
          ),
      ).toHaveLength(1);
      expect(
        await database
          .select({ id: documentHistory.id })
          .from(documentHistory)
          .where(
            and(eq(documentHistory.projectId, COPY_PROJECT), eq(documentHistory.projectVersion, 2)),
          ),
      ).toHaveLength(1);
      expect(() => fake.assertComplete()).not.toThrow();
    } finally {
      fake.stop();
    }
  });

  test("rejects missing and partially occupied allowlists without partial writes", async () => {
    await seedCategory(database, MISSING_PROJECT, MISSING_CATEGORY, 1, "Deleted source", true);
    await seedCategory(database, PARTIAL_PROJECT, PARTIAL_CATEGORY, 1, "Partial source");
    await seedDocumentType(database, PARTIAL_PROJECT, PARTIAL_TYPE, PARTIAL_CATEGORY, 1);
    await seedCategory(
      database,
      PARTIAL_PROJECT,
      PARTIAL_CATEGORY,
      2,
      "Soft-deleted target still occupies the version",
      true,
    );
    const fake = startProjectLogicFake([
      {
        operation: "validate-version-lock",
        projectId: MISSING_PROJECT,
        input: { sourceVersion: 1, targetVersion: 2, lockToken: "missing-lock" },
        result: { status: 204 },
      },
      {
        operation: "validate-version-lock",
        projectId: PARTIAL_PROJECT,
        input: { sourceVersion: 1, targetVersion: 2, lockToken: "partial-lock" },
        result: { status: 204 },
      },
    ]);
    try {
      const app = createVersionOperationsApp(persistence, createProjectLogicClient(fake.url));
      expect(
        await post(app, `/${MISSING_PROJECT}/copy-version`, {
          sourceVersion: 1,
          targetVersion: 2,
          lockToken: "missing-lock",
          dryRun: false,
          nodes: [{ nodeType: "category", id: MISSING_CATEGORY }],
        }),
      ).toEqual({
        status: 422,
        body: { detail: "copy-version allow-list contains missing source nodes" },
      });
      expect(
        await post(app, `/${PARTIAL_PROJECT}/copy-version`, {
          sourceVersion: 1,
          targetVersion: 2,
          lockToken: "partial-lock",
          dryRun: false,
          nodes: [
            { nodeType: "category", id: PARTIAL_CATEGORY },
            { nodeType: "document_type", id: PARTIAL_TYPE },
          ],
        }),
      ).toEqual({
        status: 409,
        body: {
          detail:
            "1 target rows already exist for project 11000000-0000-4000-8000-000000000002 at projectVersion 2",
        },
      });
      expect(
        await database
          .select({ id: documentTypes.id })
          .from(documentTypes)
          .where(
            and(eq(documentTypes.projectId, PARTIAL_PROJECT), eq(documentTypes.projectVersion, 2)),
          ),
      ).toEqual([]);
      expect(
        await database
          .select({ id: auditLogs.id })
          .from(auditLogs)
          .where(inArray(auditLogs.projectId, [MISSING_PROJECT, PARTIAL_PROJECT])),
      ).toEqual([]);
      expect(() => fake.assertComplete()).not.toThrow();
    } finally {
      fake.stop();
    }
  });

  test("rolls back copied rows, trigger history, and audit when PostgreSQL rejects commit", async () => {
    await seedCategory(database, ROLLBACK_PROJECT, ROLLBACK_CATEGORY, 1, "Rollback source");
    await seedDocumentType(database, ROLLBACK_PROJECT, ROLLBACK_TYPE, ROLLBACK_CATEGORY, 1);
    const fake = startProjectLogicFake([
      {
        operation: "validate-version-lock",
        projectId: ROLLBACK_PROJECT,
        input: { sourceVersion: 1, targetVersion: 2, lockToken: "rollback-lock" },
        result: { status: 204 },
      },
    ]);
    try {
      const app = createVersionOperationsApp(persistence, createProjectLogicClient(fake.url));
      const response = await post(app, `/${ROLLBACK_PROJECT}/copy-version`, {
        sourceVersion: 1,
        targetVersion: 2,
        lockToken: "rollback-lock",
        dryRun: false,
        nodes: [{ nodeType: "document_type", id: ROLLBACK_TYPE }],
      });
      expect(response.status).toBe(500);
      expect(
        await database
          .select({ id: documentTypes.id })
          .from(documentTypes)
          .where(
            and(eq(documentTypes.projectId, ROLLBACK_PROJECT), eq(documentTypes.projectVersion, 2)),
          ),
      ).toEqual([]);
      expect(
        await database
          .select({ id: documentTypeHistory.id })
          .from(documentTypeHistory)
          .where(eq(documentTypeHistory.projectId, ROLLBACK_PROJECT)),
      ).toEqual([]);
      expect(
        await database
          .select({ id: auditLogs.id })
          .from(auditLogs)
          .where(eq(auditLogs.projectId, ROLLBACK_PROJECT)),
      ).toEqual([]);
      expect(() => fake.assertComplete()).not.toThrow();
    } finally {
      fake.stop();
    }
  });

  test("leaves PostgreSQL untouched when the real peer rejects the lock", async () => {
    await seedCategory(database, PEER_PROJECT, PEER_CATEGORY, 1, "Peer source");
    const fake = startProjectLogicFake([
      {
        operation: "validate-version-lock",
        projectId: PEER_PROJECT,
        input: { sourceVersion: 1, targetVersion: 2, lockToken: "wrong-lock" },
        result: { status: 409, body: { detail: "lock mismatch" } },
      },
    ]);
    try {
      const app = createVersionOperationsApp(persistence, createProjectLogicClient(fake.url));
      expect(
        await post(app, `/${PEER_PROJECT}/copy-version`, {
          sourceVersion: 1,
          targetVersion: 2,
          lockToken: "wrong-lock",
          dryRun: false,
          nodes: [{ nodeType: "category", id: PEER_CATEGORY }],
        }),
      ).toEqual({
        status: 409,
        body: { detail: "Project version conflict" },
      });
      expect(
        await database
          .select({ id: categories.id })
          .from(categories)
          .where(and(eq(categories.projectId, PEER_PROJECT), eq(categories.projectVersion, 2))),
      ).toEqual([]);
      expect(
        await database
          .select({ id: auditLogs.id })
          .from(auditLogs)
          .where(eq(auditLogs.projectId, PEER_PROJECT)),
      ).toEqual([]);
      expect(() => fake.assertComplete()).not.toThrow();
    } finally {
      fake.stop();
    }
  });
});
