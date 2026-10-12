import { describe, expect, test } from "bun:test";
import { auditLogs } from "@spark-workflow/audit-client/schema";
import { type PostgresQueryClient, type PostgresScope } from "@spark-workflow/postgres-runtime";
import { Result } from "better-result";
import type { SQL } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sql";
import { PgDialect, type AnyPgTable } from "drizzle-orm/pg-core";

import {
  categories,
  documents,
  documentTypes,
  formalCompletenessSchema,
} from "../src/db/schema.ts";
import { formalCompletenessErrors } from "../src/errors.ts";
import {
  createCustomDocumentType,
  deleteCustomDocumentType,
  updateDocumentAssignment,
  updateDocumentType,
} from "../src/mutations.ts";

const projectId = "71000000-0000-4000-8000-000000000001";
const categoryId = "72000000-0000-4000-8000-000000000001";
const documentTypeId = "73000000-0000-4000-8000-000000000001";
const documentId = "74000000-0000-4000-8000-000000000001";
const fileId = "75000000-0000-4000-8000-000000000001";
const now = new Date("2026-08-29T08:00:00.000Z");
const dialect = new PgDialect();

type MutationInsert = typeof documentTypes.$inferInsert | typeof auditLogs.$inferInsert;
type MutationUpdate =
  | Partial<typeof documents.$inferInsert>
  | Partial<typeof documentTypes.$inferInsert>;

const documentTypeRow = (origin: "custom" | "system"): typeof documentTypes.$inferSelect => ({
  id: documentTypeId,
  projectId,
  name: "Application",
  description: "",
  createdAt: now,
  updatedAt: now,
  confidence: null,
  categoryId,
  isDeleted: false,
  isResolved: false,
  origin,
  sysPeriod: "[2026-08-29 08:00:00+00,)",
  frontendParentIds: [],
  updateType: "AUTOMATED",
  projectVersion: 1,
  isOutdated: false,
});

const documentRow: typeof documents.$inferSelect = {
  id: documentId,
  projectId,
  fileId,
  aiSuggestedRequiredDocumentTypeId: null,
  documentName: "application.pdf",
  reasoning: null,
  confidence: null,
  createdAt: now,
  updatedAt: now,
  humanRequiredDocumentTypeId: null,
  contentExtractionId: null,
  sysPeriod: "[2026-08-29 08:00:00+00,)",
  isDeleted: false,
  frontendParentIds: [],
  updateType: "AUTOMATED",
  projectVersion: 1,
  isOutdated: false,
};

const projects = {
  validateWriteVersion: async () => Result.ok(undefined),
};

function transactionScope(
  database: PostgresQueryClient<typeof formalCompletenessSchema>,
): PostgresScope<typeof formalCompletenessSchema> & {
  readonly queryScopes: boolean[];
  readonly transactionCount: () => number;
} {
  let active = false;
  let transactions = 0;
  const queryScopes: boolean[] = [];
  return {
    queryScopes,
    transactionCount: () => transactions,
    query: (callback) => {
      queryScopes.push(active);
      return callback(database);
    },
    streamRows: async function* () {
      yield* [];
    },
    async transact(callback) {
      if (active) throw new Error("Nested transaction");
      transactions += 1;
      active = true;
      try {
        return await callback();
      } finally {
        active = false;
      }
    },
  };
}

describe("Formal Completeness domain mutations", () => {
  test("creates a custom document type in the Benutzerdefiniert category and audits it", async () => {
    const inserted: MutationInsert[] = [];
    const audited: MutationInsert[] = [];
    const database = Object.assign(drizzle.mock({ schema: formalCompletenessSchema }), {
      select: () => ({
        from: (table: AnyPgTable) => ({
          where: () => ({
            limit: () => ({
              for: async () => (table === categories ? [{ id: categoryId }] : []),
            }),
          }),
        }),
      }),
      insert: (table: AnyPgTable) => ({
        values: (value: MutationInsert) => {
          if (table === documentTypes) {
            inserted.push(value);
            return {
              returning: async () => [{ ...documentTypeRow("custom"), id: value.id }],
            };
          }
          if (table === auditLogs) {
            audited.push(value);
            return Promise.resolve();
          }
          throw new Error("Unexpected insert");
        },
      }),
      $client: undefined,
    });
    const postgres = transactionScope(database);

    const created = await createCustomDocumentType({
      postgres,
      projects,
      projectId,
      projectVersion: 1,
      documentName: "Application",
    });

    expect(created.origin).toBe("custom");
    expect(inserted).toEqual([
      expect.objectContaining({
        projectId,
        projectVersion: 1,
        categoryId,
        name: "Application",
        description: "",
        origin: "custom",
      }),
    ]);
    expect(audited).toEqual([
      expect.objectContaining({
        projectId,
        entityType: "document_type",
        entityId: created.id,
        changeType: "create",
      }),
    ]);
    expect(postgres.transactionCount()).toBe(1);
    expect(postgres.queryScopes).toEqual([true]);
  });

  test("rejects renaming a system document type before update or audit", async () => {
    const database = Object.assign(drizzle.mock({ schema: formalCompletenessSchema }), {
      select: () => ({
        from: () => ({
          where: () => ({ limit: () => ({ for: async () => [documentTypeRow("system")] }) }),
        }),
      }),
      update: () => {
        throw new Error("System document type must not be updated");
      },
      insert: () => {
        throw new Error("Rejected rename must not be audited");
      },
      $client: undefined,
    });
    const postgres = transactionScope(database);

    await expect(
      updateDocumentType({
        postgres,
        projects,
        projectId,
        projectVersion: 1,
        documentTypeId,
        documentName: "Renamed",
      }),
    ).rejects.toMatchObject({
      code: formalCompletenessErrors.SYSTEM_DOCUMENT_TYPE_FORBIDDEN.code,
    });
    expect(postgres.transactionCount()).toBe(1);
    expect(postgres.queryScopes).toEqual([true]);
  });

  test("rejects a document type outside the document project and version", async () => {
    const predicates: SQL[] = [];
    const database = Object.assign(drizzle.mock({ schema: formalCompletenessSchema }), {
      select: () => ({
        from: (table: AnyPgTable) => ({
          where: (predicate: SQL) => ({
            limit: () => ({
              for: async () => {
                predicates.push(predicate);
                return table === documents ? [documentRow] : [];
              },
            }),
          }),
        }),
      }),
      update: () => {
        throw new Error("Invalid assignment must not update the document");
      },
      insert: () => {
        throw new Error("Invalid assignment must not be audited");
      },
      $client: undefined,
    });
    const postgres = transactionScope(database);

    await expect(
      updateDocumentAssignment({
        postgres,
        projects,
        projectId,
        projectVersion: 1,
        target: { kind: "id", id: documentId },
        humanRequiredDocumentTypeId: documentTypeId,
      }),
    ).rejects.toMatchObject({ code: formalCompletenessErrors.DOCUMENT_TYPE_NOT_FOUND.code });
    expect(dialect.sqlToQuery(predicates[1]!).params).toEqual(
      expect.arrayContaining([documentTypeId, projectId, 1, false]),
    );
    expect(postgres.transactionCount()).toBe(1);
    expect(postgres.queryScopes).toEqual([true]);
  });

  test("clears both document references before soft-deleting and auditing a custom type", async () => {
    const updates: Array<{ table: AnyPgTable; values: MutationUpdate }> = [];
    const audited: MutationInsert[] = [];
    const deleted = { ...documentTypeRow("custom"), isDeleted: true };
    const database = Object.assign(drizzle.mock({ schema: formalCompletenessSchema }), {
      select: () => ({
        from: () => ({
          where: () => ({ limit: () => ({ for: async () => [{ origin: "custom" }] }) }),
        }),
      }),
      update: (table: AnyPgTable) => ({
        set: (values: MutationUpdate) => ({
          where: () => {
            updates.push({ table, values });
            return table === documentTypes
              ? { returning: async () => [deleted] }
              : Promise.resolve();
          },
        }),
      }),
      insert: (table: AnyPgTable) => ({
        values: (value: MutationInsert) => {
          if (table !== auditLogs) throw new Error("Unexpected insert");
          audited.push(value);
          return Promise.resolve();
        },
      }),
      $client: undefined,
    });
    const postgres = transactionScope(database);

    const result = await deleteCustomDocumentType({
      postgres,
      projects,
      projectId,
      projectVersion: 1,
      documentTypeId,
    });

    expect(result.isDeleted).toBe(true);
    expect(updates).toEqual([
      { table: documents, values: { aiSuggestedRequiredDocumentTypeId: null } },
      { table: documents, values: { humanRequiredDocumentTypeId: null } },
      { table: documentTypes, values: { isDeleted: true } },
    ]);
    expect(audited).toHaveLength(1);
    expect(postgres.transactionCount()).toBe(1);
    expect(postgres.queryScopes).toEqual([true]);
  });
});
