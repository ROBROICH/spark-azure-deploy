import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { projects } from "@spark-workflow/core/projects/schema";
import type { HttpJson } from "@spark-workflow/http-host";
import { and, eq, ne } from "drizzle-orm";

import { risks, vaeNodes } from "../src/db/schema.ts";
import { createPostgresApp, databaseUrl } from "./support/postgres-app.ts";

const describeDatabaseTests = databaseUrl === undefined ? describe.skip : describe;

describeDatabaseTests("risk VAE node references stay inside the risk's project", () => {
  const own = { projectId: crypto.randomUUID(), vaeNodeId: crypto.randomUUID() };
  const foreign = { projectId: crypto.randomUUID(), vaeNodeId: crypto.randomUUID() };
  const projectIds = [own.projectId, foreign.projectId];
  const riskId = crypto.randomUUID();
  const risk = { problem: "Noise", severity: 3, implication: "Delay" };
  let harness: Awaited<ReturnType<typeof createPostgresApp>>;

  beforeAll(async () => {
    harness = await createPostgresApp(databaseUrl!);
    await harness.database.query(async (query) => {
      await query
        .insert(projects)
        .values(projectIds.map((id) => ({ id, createdById: crypto.randomUUID() })));
      await query.insert(vaeNodes).values(
        [own, foreign].map(({ projectId, vaeNodeId }) => ({
          id: vaeNodeId,
          projectId,
          title: "Node",
          text: "Node",
        })),
      );
      await query.insert(risks).values({
        id: riskId,
        projectId: own.projectId,
        vaeNodeId: own.vaeNodeId,
        status: "OPEN",
        ...risk,
      });
    });
  });

  afterAll(() => harness.close(projectIds));

  const send = (method: string, path: string, body: HttpJson) =>
    harness.app.handle(
      new Request(`http://localhost${path}`, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
    );

  const risksOutsideOwnNode = () =>
    harness.database.query((query) =>
      query
        .select({ id: risks.id, vaeNodeId: risks.vaeNodeId })
        .from(risks)
        .where(and(eq(risks.projectId, own.projectId), ne(risks.vaeNodeId, own.vaeNodeId))),
    );

  const writers = {
    "risk create": {
      write: (vaeNodeId: string) =>
        send("POST", `/risks/${own.projectId}`, { risks: [{ ...risk, vaeNodeId }] }),
    },
    "risk update": {
      write: (vaeNodeId: string) => send("PATCH", `/risks/${riskId}`, { vaeNodeId }),
    },
    "node mutation": {
      write: (vaeNodeId: string) =>
        send("POST", `/${own.projectId}/update?projectVersion=1`, {
          inserts: [{ nodeType: "risks", payload: { ...risk, status: "open", vaeNodeId } }],
        }),
    },
  };

  for (const [writer, { write }] of Object.entries(writers)) {
    for (const [reference, vaeNodeId] of [
      ["another project's", foreign.vaeNodeId],
      ["a missing", crypto.randomUUID()],
    ] as const) {
      test(`${writer} rejects ${reference} VAE node with 422 and stores nothing`, async () => {
        const response = await write(vaeNodeId);

        expect(response.status).toBe(422);
        expect(await risksOutsideOwnNode()).toEqual([]);
      });
    }
  }

  test("risk create still accepts a VAE node of the risk's own project", async () => {
    const response = await writers["risk create"].write(own.vaeNodeId);

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject([
      { projectId: own.projectId, vaeNodeId: own.vaeNodeId },
    ]);
  });
});
