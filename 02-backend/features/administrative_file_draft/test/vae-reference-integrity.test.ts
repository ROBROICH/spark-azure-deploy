import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { projects } from "@spark-workflow/core/projects/schema";
import { extractPostgresDriverErrorFacts, type PostgresScope } from "@spark-workflow/postgres-runtime";
import { and, eq } from "drizzle-orm";

import { afdSchema, risks, vaeNodes } from "../src/db/schema.ts";
import { createPostgresApp, databaseUrl } from "./support/postgres-app.ts";

const describeDatabaseTests = databaseUrl === undefined ? describe.skip : describe;

describeDatabaseTests("VAE foreign keys validate project and version at commit", () => {
  const projectId = crypto.randomUUID();
  const foreignProjectId = crypto.randomUUID();
  const foreignNodeId = crypto.randomUUID();
  const otherVersionNodeId = crypto.randomUUID();
  const risk = { problem: "Noise", severity: 3, implication: "Delay", status: "OPEN" as const };
  let database: PostgresScope<typeof afdSchema>;
  let close: (projectIds: readonly string[]) => Promise<void>;

  beforeAll(async () => {
    const harness = await createPostgresApp(databaseUrl!);
    database = harness.database;
    close = harness.close;
    await database.query(async (query) => {
      await query.insert(projects).values(
        [projectId, foreignProjectId].map((id) => ({ id, createdById: crypto.randomUUID() })),
      );
      await query.insert(vaeNodes).values([
        { id: foreignNodeId, projectId: foreignProjectId, title: "Foreign", text: "Foreign" },
        { id: otherVersionNodeId, projectId, projectVersion: 2, title: "Version 2", text: "Version 2" },
      ]);
    });
  });

  afterAll(() => close([projectId, foreignProjectId]));

  test("commits risks and children inserted before their VAE parents", async () => {
    const parentId = crypto.randomUUID();
    const childId = crypto.randomUUID();
    const riskId = crypto.randomUUID();

    await database.transact(async () => {
      await database.query(async (query) => {
        await query.insert(risks).values({ id: riskId, projectId, vaeNodeId: childId, ...risk });
        await query.insert(vaeNodes).values({
          id: childId, projectId, parentVaeNodeId: parentId, title: "Child", text: "Child",
        });
        await query.insert(vaeNodes).values({ id: parentId, projectId, title: "Parent", text: "Parent" });
      });
    });

    expect(await database.query((query) =>
      query.select({ riskId: risks.id, childId: vaeNodes.id, parentId: vaeNodes.parentVaeNodeId })
        .from(risks)
        .innerJoin(vaeNodes, and(
          eq(risks.vaeNodeId, vaeNodes.id),
          eq(risks.projectId, vaeNodes.projectId),
          eq(risks.projectVersion, vaeNodes.projectVersion),
        ))
        .where(eq(risks.id, riskId)),
    )).toEqual([{ riskId, childId, parentId }]);
  });

  for (const reference of ["parent", "risk"] as const) {
    for (const [scope, vaeNodeId] of [
      ["project", foreignNodeId],
      ["version", otherVersionNodeId],
    ] as const) {
      test(`rejects a ${reference} reference from another ${scope} at commit and rolls it back`, async () => {
        const id = crypto.randomUUID();
        let insertCompleted = false;
        const failure = await database.transact(async () => {
          await database.query(async (query) => {
            if (reference === "parent") {
              await query.insert(vaeNodes).values({
                id, projectId, parentVaeNodeId: vaeNodeId, title: "Child", text: "Child",
              });
            } else {
              await query.insert(risks).values({ id, projectId, vaeNodeId, ...risk });
            }
          });
          insertCompleted = true;
        }).catch(extractPostgresDriverErrorFacts);

        expect(insertCompleted).toBe(true);
        expect(failure).toMatchObject({ code: "23503" });
        const table = reference === "parent" ? vaeNodes : risks;
        expect(await database.query((query) =>
          query.select({ id: table.id }).from(table).where(eq(table.id, id)),
        )).toEqual([]);
      });
    }
  }
});
