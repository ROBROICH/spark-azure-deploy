import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Result } from "better-result";
import { and, eq } from "drizzle-orm";

import { bindNodeRuntime, defineNodeDescriptor } from "../src";
import { copyProjectVersionNodes } from "../src/version-operations";
import { categories, categoryHistory } from "./fixtures/formal-completeness/schema";
import { createNodeTestDatabase } from "./support/database";

const databaseUrl = process.env.NODE_CRUD_VERSION_TEST_URL;
const realPostgres = databaseUrl ? describe : describe.skip;
const nodeCount = 70_000;

realPostgres("large project version copy", () => {
  const projectId = crypto.randomUUID();
  const schema = { categories };
  let testDatabase: Awaited<ReturnType<typeof createNodeTestDatabase<typeof schema>>>;
  let nodes: { nodeType: string; id: string }[];

  const runtime = () =>
    bindNodeRuntime(
      defineNodeDescriptor({ name: "large-version-copy", auditLogEnabled: false, schema }),
      {
        persistence: testDatabase.persistence,
        versionPeer: {
          resolveLatestVersion: async () => Result.ok(1),
          validateWriteVersion: async () => Result.ok(undefined),
          validateVersionLock: async () => Result.ok(undefined),
        },
      },
    );
  const targetRows = () =>
    testDatabase.database
      .select({ id: categories.id })
      .from(categories)
      .where(and(eq(categories.projectId, projectId), eq(categories.projectVersion, 2)));

  beforeAll(async () => {
    testDatabase = await createNodeTestDatabase(databaseUrl!, schema);
    const ids = Array.from({ length: nodeCount }, () => crypto.randomUUID());
    for (let offset = 0; offset < ids.length; offset += 5_000) {
      await testDatabase.database.insert(categories).values(
        ids.slice(offset, offset + 5_000).map((id) => ({
          id,
          projectId,
          projectVersion: 1,
          name: "Large project category",
          createdAt: new Date(),
          updatedAt: new Date(),
          sysPeriod: "[2026-10-07 00:00:00+00,)",
        })),
      );
    }
    nodes = ids.map((id) => ({ nodeType: "category", id }));
  }, 60_000);

  afterAll(async () => {
    await testDatabase.database.delete(categories).where(eq(categories.projectId, projectId));
    await testDatabase.database
      .delete(categoryHistory)
      .where(eq(categoryHistory.projectId, projectId));
    await testDatabase.close();
  }, 60_000);

  test("copies more nodes than one statement can bind and rejects incomplete inputs", async () => {
    const input = {
      descriptor: runtime(),
      projectId,
      sourceVersion: 1,
      targetVersion: 2,
      lockToken: "large-copy",
      nodes,
    };
    expect((await copyProjectVersionNodes({ ...input, dryRun: true })).unwrap()).toEqual({
      copied: nodeCount,
    });
    const missing = await copyProjectVersionNodes({
      ...input,
      dryRun: false,
      nodes: [
        ...nodes.slice(0, -1),
        { nodeType: "category", id: "ffffffff-ffff-4fff-bfff-ffffffffffff" },
      ],
    });
    expect(missing.status).toBe("error");
    expect(await targetRows()).toEqual([]);
    expect((await copyProjectVersionNodes({ ...input, dryRun: false })).unwrap()).toEqual({
      copied: nodeCount,
    });
    expect((await copyProjectVersionNodes({ ...input, dryRun: false })).unwrap()).toEqual({
      copied: nodeCount,
    });
    await testDatabase.database
      .delete(categories)
      .where(
        and(
          eq(categories.projectId, projectId),
          eq(categories.projectVersion, 2),
          eq(categories.id, nodes.at(-1)!.id),
        ),
      );
    expect((await copyProjectVersionNodes({ ...input, dryRun: false })).status).toBe("error");
  }, 120_000);
});
