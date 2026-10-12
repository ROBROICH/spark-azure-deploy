import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { currentAuditContext } from "@spark-workflow/audit-client";
import {
  projects,
  projectVersionLocks,
  subtopicHistory,
  subtopics,
  topicHistory,
  topics,
} from "@spark-workflow/core/projects/schema";
import {
  createNodeVersionService,
  mutateNodes,
  trustedServiceAuthorization,
} from "@spark-workflow/node-crud";
import { and, eq, inArray } from "drizzle-orm";

import { afdSchema, vaeNodes } from "../src/db/schema.ts";
import { assignTemplate } from "../src/versioning.ts";
import { createPostgresApp, databaseUrl } from "./support/postgres-app.ts";

const databaseTests = databaseUrl === undefined ? describe.skip : describe;

databaseTests("chapter external parent admission", () => {
  const projectId = crypto.randomUUID();
  const foreignProjectId = crypto.randomUUID();
  const activeTopic = crypto.randomUUID();
  const activeSubtopic = crypto.randomUUID();
  const deletedTopic = crypto.randomUUID();
  const deletedSubtopic = crypto.randomUUID();
  const foreignTopic = crypto.randomUUID();
  const otherVersionTopic = crypto.randomUUID();
  const nodeId = crypto.randomUUID();
  const remapNodeId = crypto.randomUUID();
  const remapTopic = crypto.randomUUID();
  const lockToken = crypto.randomUUID();
  let harness: Awaited<ReturnType<typeof createPostgresApp>>;

  const visibility = { showInMvp: true, showInEwm: true, showInBeschluss: true };
  const savedChapters = () =>
    [nodeId, remapNodeId].map((id) => ({
      id,
      projectId,
      projectVersion: 2,
      title: "Saved chapter",
      text: "Original text",
    }));

  beforeAll(async () => {
    harness = await createPostgresApp(databaseUrl!);
    await harness.database.query(async (query) => {
      await query.insert(projects).values([
        { id: projectId, projectVersion: 1, createdById: crypto.randomUUID() },
        { id: projectId, projectVersion: 2, createdById: crypto.randomUUID() },
        { id: foreignProjectId, createdById: crypto.randomUUID() },
      ]);
      await query.insert(topics).values([
        { id: activeTopic, projectId, projectVersion: 2, name: "Active", ...visibility },
        { id: deletedTopic, projectId, projectVersion: 2, name: "Removed", ...visibility },
        {
          id: foreignTopic,
          projectId: foreignProjectId,
          projectVersion: 1,
          name: "Foreign",
          ...visibility,
        },
        {
          id: otherVersionTopic,
          projectId,
          projectVersion: 1,
          name: "Different snapshot",
          ...visibility,
        },
      ]);
      await query.insert(subtopics).values([
        {
          id: activeSubtopic,
          projectId,
          projectVersion: 2,
          topicId: activeTopic,
          name: "Active subtopic",
          ...visibility,
        },
        {
          id: deletedSubtopic,
          projectId,
          projectVersion: 2,
          topicId: activeTopic,
          name: "Removed subtopic",
          ...visibility,
        },
      ]);
      await query.insert(vaeNodes).values(savedChapters());
    });
    (
      await mutateNodes(harness.projectNodes, trustedServiceAuthorization, projectId, 2, {
        deletes: [
          { nodeType: "subtopic", id: deletedSubtopic },
          { nodeType: "topic", id: deletedTopic },
        ],
      })
    ).unwrap();
  });

  afterAll(async () => {
    await harness.database.query(async (query) => {
      await query.delete(vaeNodes).where(eq(vaeNodes.projectId, projectId));
      await query.delete(projectVersionLocks).where(eq(projectVersionLocks.projectId, projectId));
      for (const table of [subtopics, subtopicHistory, topics, topicHistory]) {
        await query.delete(table).where(inArray(table.projectId, [projectId, foreignProjectId]));
      }
    });
    await harness.close([projectId, foreignProjectId]);
  });

  for (const [label, field, parentId] of [
    ["deleted topic", "topicId", deletedTopic],
    ["deleted subtopic", "subtopicId", deletedSubtopic],
    ["foreign project", "topicId", foreignTopic],
    ["different version", "topicId", otherVersionTopic],
  ] as const) {
    test(`rejects a ${label} on insert and patch without writing`, async () => {
      const insertId = crypto.randomUUID();
      const inserted = await mutateNodes(
        harness.nodes,
        trustedServiceAuthorization,
        projectId,
        2,
        {
          inserts: [
            {
              nodeType: "vae_node",
              id: insertId,
              payload: { title: "Stale chapter", text: "Draft", [field]: parentId },
            },
          ],
        },
      );
      expect(inserted.isErr() && inserted.error.status).toBe(422);
      const patched = await mutateNodes(harness.nodes, trustedServiceAuthorization, projectId, 2, {
        updates: [
          {
            nodeType: "vae_node",
            id: nodeId,
            payload: { text: "Must not overwrite", [field]: parentId },
          },
        ],
      });
      expect(patched.isErr() && patched.error.status).toBe(422);
      expect(
        await harness.database.query((query) =>
          query.select({ text: vaeNodes.text }).from(vaeNodes).where(eq(vaeNodes.id, nodeId)),
        ),
      ).toEqual([{ text: "Original text" }]);
      expect(
        await harness.database.query((query) =>
          query.select({ id: vaeNodes.id }).from(vaeNodes).where(eq(vaeNodes.id, insertId)),
        ),
      ).toEqual([]);
    });
  }

  test("accepts active parents of the version and clearing optional references", async () => {
    const result = await mutateNodes(harness.nodes, trustedServiceAuthorization, projectId, 2, {
      updates: [
        {
          nodeType: "vae_node",
          id: nodeId,
          payload: { topicId: activeTopic, subtopicId: activeSubtopic },
        },
      ],
    });
    expect(result.unwrap().updated[0]).toMatchObject({
      topicId: activeTopic,
      subtopicId: activeSubtopic,
      text: "Original text",
    });
    const cleared = await mutateNodes(harness.nodes, trustedServiceAuthorization, projectId, 2, {
      updates: [{ nodeType: "vae_node", id: nodeId, payload: { topicId: null, subtopicId: null } }],
    });
    expect(cleared.unwrap().updated[0]).toMatchObject({ topicId: null, subtopicId: null });
  });

  test("historical writes and a concurrent topic deletion cannot leave a broken parent", async () => {
    const historical = await mutateNodes(harness.nodes, trustedServiceAuthorization, projectId, 1, {
      updates: [{ nodeType: "vae_node", id: nodeId, payload: { topicId: activeTopic } }],
    });
    expect(historical.isErr() && historical.error.status).toBe(409);
    const topicId = crypto.randomUUID();
    (
      await mutateNodes(harness.projectNodes, trustedServiceAuthorization, projectId, 2, {
        inserts: [
          { nodeType: "topic", id: topicId, payload: { name: "Concurrent topic", ...visibility } },
        ],
      })
    ).unwrap();
    const outcomes = await Promise.all([
      mutateNodes(harness.projectNodes, trustedServiceAuthorization, projectId, 2, {
        deletes: [{ nodeType: "topic", id: topicId }],
      }),
      mutateNodes(harness.nodes, trustedServiceAuthorization, projectId, 2, {
        inserts: [
          {
            nodeType: "vae_node",
            payload: { title: "Concurrent chapter", text: "Preserved", topicId },
          },
        ],
      }),
    ]);
    expect(outcomes.filter((result) => result.isOk())).toHaveLength(1);
    expect(outcomes.filter((result) => result.isErr())).toHaveLength(1);
    await harness.database.query((query) =>
      query
        .delete(vaeNodes)
        .where(and(eq(vaeNodes.projectId, projectId), eq(vaeNodes.title, "Concurrent chapter"))),
    );
  });

  test("template assignment rejects stale topic metadata before inserting chapters", async () => {
    const nodes = [
      {
        id: crypto.randomUUID(),
        parent_vae_node_id: null,
        title: "Template chapter",
        text: "Template",
        topic: "Template topic",
        order: 0,
        is_hidden: false,
        can_add_child: false,
      },
    ];
    for (const topicId of [deletedTopic, foreignTopic, otherVersionTopic, activeTopic]) {
      await harness.database.query((query) =>
        query.delete(vaeNodes).where(eq(vaeNodes.projectId, projectId)),
      );
      const assignment = assignTemplate(
        harness.database.scope(afdSchema),
        harness.projects,
        projectId,
        2,
        nodes,
        [{ id: topicId, name: "Template topic" }],
        currentAuditContext(),
      );
      if (topicId === activeTopic) await assignment;
      else await expect(assignment).rejects.toMatchObject({ status: 422 });
      expect(
        await harness.database.query((query) =>
          query
            .select({ topicId: vaeNodes.topicId })
            .from(vaeNodes)
            .where(eq(vaeNodes.projectId, projectId)),
        ),
      ).toEqual(topicId === activeTopic ? [{ topicId }] : []);
    }
    await harness.database.query(async (query) => {
      await query.delete(vaeNodes).where(eq(vaeNodes.projectId, projectId));
      await query.insert(vaeNodes).values(savedChapters());
    });
  });

  test("copy validates the preflight, the destination, overrides and stored retries", async () => {
    (
      await mutateNodes(harness.nodes, trustedServiceAuthorization, projectId, 2, {
        updates: [
          {
            nodeType: "vae_node",
            id: nodeId,
            payload: { topicId: activeTopic, subtopicId: activeSubtopic },
          },
        ],
      })
    ).unwrap();
    await harness.database.query((query) =>
      query.insert(projectVersionLocks).values({
        id: crypto.randomUUID(),
        projectId,
        sourceVersion: 2,
        targetVersion: 3,
        lockToken,
      }),
    );
    const versioning = createNodeVersionService(harness.nodes);
    const request = {
      projectId,
      sourceVersion: 2,
      targetVersion: 3,
      lockToken,
      nodes: [{ nodeType: "vae_node", id: nodeId }],
      dryRun: true,
    };
    expect(await versioning.copyVersion(request)).toEqual({ dryRun: true, copied: 1 });
    await expect(versioning.copyVersion({ ...request, dryRun: false })).rejects.toMatchObject({
      status: 422,
    });
    const targetChapters = () =>
      harness.database.query((query) =>
        query
          .select({ id: vaeNodes.id, topicId: vaeNodes.topicId, text: vaeNodes.text })
          .from(vaeNodes)
          .where(and(eq(vaeNodes.projectId, projectId), eq(vaeNodes.projectVersion, 3))),
      );
    expect(await targetChapters()).toEqual([]);
    for (const topicId of [deletedTopic, foreignTopic]) {
      const response = await harness.app.handle(
        new Request(`http://localhost/${projectId}/copy-version`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            sourceVersion: request.sourceVersion,
            targetVersion: request.targetVersion,
            lockToken,
            dryRun: true,
            nodes: [{ nodeType: "vae_node", id: nodeId, overrides: { topicId } }],
          }),
        }),
      );
      expect(response.status).toBe(422);
      expect(await response.text()).toContain("Invalid chapter parent");
    }
    await harness.database.query(async (query) => {
      await query
        .insert(projects)
        .values({ id: projectId, projectVersion: 3, createdById: crypto.randomUUID() });
      await query.insert(topics).values({
        id: remapTopic,
        projectId,
        projectVersion: 3,
        name: "Remapped target",
        ...visibility,
      });
    });
    expect(
      await createNodeVersionService(harness.projectNodes).copyVersion({
        ...request,
        nodes: [
          { nodeType: "topic", id: activeTopic },
          { nodeType: "subtopic", id: activeSubtopic },
        ],
        dryRun: false,
      }),
    ).toEqual({ dryRun: false, copied: 2 });
    expect(await versioning.copyVersion({ ...request, dryRun: false })).toEqual({
      dryRun: false,
      copied: 1,
    });
    const remap = {
      ...request,
      nodes: [
        {
          nodeType: "vae_node",
          id: remapNodeId,
          overrides: { topicId: remapTopic, text: "Retargeted" },
        },
      ],
    };
    expect(await versioning.copyVersion(remap)).toEqual({ dryRun: true, copied: 1 });
    expect(await versioning.copyVersion({ ...remap, dryRun: false })).toEqual({
      dryRun: false,
      copied: 1,
    });
    expect((await targetChapters()).find(({ id }) => id === remapNodeId)).toEqual({
      id: remapNodeId,
      topicId: remapTopic,
      text: "Retargeted",
    });
    await harness.database.query((query) =>
      query
        .update(topics)
        .set({ isDeleted: true })
        .where(and(eq(topics.id, activeTopic), eq(topics.projectVersion, 3))),
    );
    for (const dryRun of [false, true]) {
      await expect(versioning.copyVersion({ ...request, dryRun })).rejects.toMatchObject({
        status: 422,
      });
    }
  });
});
