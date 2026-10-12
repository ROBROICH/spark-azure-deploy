import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { projects } from "@spark-workflow/core/projects/schema";
import {
  mutateNodes,
  NodePermissionError,
  trustedServiceAuthorization,
  type RequestAuthorization,
} from "@spark-workflow/node-crud";
import { Result } from "better-result";
import { eq } from "drizzle-orm";

import { vaeNodes } from "../src/db/schema.ts";
import { createPostgresApp, databaseUrl } from "./support/postgres-app.ts";

const databaseTests = databaseUrl === undefined ? describe.skip : describe;
const member: RequestAuthorization = {
  user: { sub: crypto.randomUUID() },
  authorize: async (checks) =>
    checks.some(({ permission }) => permission === "approve")
      ? Result.err(NodePermissionError())
      : Result.ok(undefined),
};

databaseTests("chapter completion transitions", () => {
  const projectId = crypto.randomUUID();
  const nodeId = crypto.randomUUID();
  const secondId = crypto.randomUUID();
  let harness: Awaited<ReturnType<typeof createPostgresApp>>;

  beforeAll(async () => {
    harness = await createPostgresApp(databaseUrl!);
    await harness.database.query(async (query) => {
      await query.insert(projects).values({ id: projectId, createdById: crypto.randomUUID() });
      await query.insert(vaeNodes).values([
        {
          id: nodeId,
          projectId,
          title: "Chapter",
          text: "Saved",
          checkedByAssignee: true,
          checkedByLeader: true,
          checkedAtAssignee: new Date(),
          checkedAtLeader: new Date(),
        },
        { id: secondId, projectId, title: "Second", text: "Unchanged" },
      ]);
    });
  });
  afterAll(() => harness.close([projectId]));

  test("a member withdraws completion and dependent approval atomically", async () => {
    const result = await mutateNodes(harness.nodes, member, projectId, 1, {
      updates: [
        {
          nodeType: "vae_node",
          id: nodeId,
          payload: { checkedByAssignee: false, checkedByLeader: false },
        },
      ],
    });
    expect(result.status).toBe("ok");
    expect(
      await harness.database.query((query) =>
        query
          .select({
            assignee: vaeNodes.checkedByAssignee,
            leader: vaeNodes.checkedByLeader,
            assigneeDate: vaeNodes.checkedAtAssignee,
            leaderDate: vaeNodes.checkedAtLeader,
          })
          .from(vaeNodes)
          .where(eq(vaeNodes.id, nodeId)),
      ),
    ).toEqual([{ assignee: false, leader: false, assigneeDate: null, leaderDate: null }]);
  });

  test("independent approval edits stay protected and an owner approves an incomplete chapter", async () => {
    for (const payload of [
      { checkedByLeader: true },
      { checkedByLeader: false },
      { checkedAtLeader: null },
    ]) {
      const result = await mutateNodes(harness.nodes, member, projectId, 1, {
        updates: [{ nodeType: "vae_node", id: nodeId, payload }],
      });
      expect(result.isErr() && result.error.status).toBe(403);
    }
    const approval = await mutateNodes(harness.nodes, trustedServiceAuthorization, projectId, 1, {
      updates: [{ nodeType: "vae_node", id: nodeId, payload: { checkedByLeader: true } }],
    });
    expect(approval.unwrap().updated[0]).toMatchObject({
      checkedByAssignee: false,
      checkedByLeader: true,
    });
  });

  test("a parent cycle rolls back the complete batch", async () => {
    const result = await mutateNodes(harness.nodes, member, projectId, 1, {
      updates: [
        {
          nodeType: "vae_node",
          id: nodeId,
          payload: { parentVaeNodeId: secondId, text: "Must roll back" },
        },
        { nodeType: "vae_node", id: secondId, payload: { parentVaeNodeId: nodeId } },
      ],
    });
    expect(result.isErr() && result.error.status).toBe(409);
    expect(
      await harness.database.query((query) =>
        query
          .select({ text: vaeNodes.text, parent: vaeNodes.parentVaeNodeId })
          .from(vaeNodes)
          .where(eq(vaeNodes.id, nodeId)),
      ),
    ).toEqual([{ text: "Saved", parent: null }]);
  });

  test("concurrent reparenting cannot commit a cycle", async () => {
    const outcomes = await Promise.all([
      mutateNodes(harness.nodes, member, projectId, 1, {
        updates: [{ nodeType: "vae_node", id: nodeId, payload: { parentVaeNodeId: secondId } }],
      }),
      mutateNodes(harness.nodes, member, projectId, 1, {
        updates: [{ nodeType: "vae_node", id: secondId, payload: { parentVaeNodeId: nodeId } }],
      }),
    ]);
    expect(outcomes.filter((outcome) => outcome.isOk())).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.isErr())).toHaveLength(1);
    const rows = await harness.database.query((query) =>
      query
        .select({ parent: vaeNodes.parentVaeNodeId })
        .from(vaeNodes)
        .where(eq(vaeNodes.projectId, projectId)),
    );
    expect(rows.filter(({ parent }) => parent === null)).toHaveLength(1);
  });
});
