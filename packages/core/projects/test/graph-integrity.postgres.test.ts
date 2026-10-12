import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { auditLogs } from "@spark-workflow/audit-client/schema";
import { createFeatureHttp, type HttpJson } from "@spark-workflow/http-host";
import {
  mutateNodes,
  trustedServiceAuthorization,
  type NodeMutationInput,
  type NodeRuntime,
} from "@spark-workflow/node-crud";
import { createPostgresRuntime, type PostgresResourceRuntime } from "@spark-workflow/postgres-runtime";
import { inArray, sql } from "drizzle-orm";

import { coreFeature } from "../../src/manifest.ts";
import { coreSchema } from "../../src/schema.ts";
import { deadlines, projects, projectLogicSchema, subtopics, topics } from "../src/db/schema.ts";
import { createTopicRoutes } from "../src/routes/topics.ts";
import { ProjectNodes, projectNodesProvider } from "../src/runtime.ts";

process.env.AUTH_MODE = "disabled";

const databaseUrl = process.env.PLS_MUTATION_DATABASE_URL;
const schema = { ...coreSchema, auditLogs };

describe.skipIf(databaseUrl === undefined)("project graph integrity", () => {
  let database: PostgresResourceRuntime<typeof schema>;
  let nodes: NodeRuntime<typeof projectLogicSchema>;
  let app: { handle(request: Request): Promise<Response> };
  const projectIds: string[] = [];

  const request = (method: string, path: string, body?: HttpJson) =>
    app.handle(
      new Request(`http://core.test${path}`, {
        method,
        headers: body === undefined ? undefined : { "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
    );
  const mutate = (projectId: string, input: NodeMutationInput) =>
    mutateNodes(nodes, trustedServiceAuthorization, projectId, 1, input);
  const status = async (projectId: string, input: NodeMutationInput) => {
    const result = await mutate(projectId, input);
    return result.isErr() ? result.error.status : 200;
  };
  const topic = (id: string, name: string, parentTopicId: string | null = null) => ({
    nodeType: "topic",
    id,
    payload: { name, parentTopicId, showInMvp: true, showInEwm: true, showInBeschluss: true },
  });
  const project = async () => {
    const id = crypto.randomUUID();
    projectIds.push(id);
    await database.query((query) =>
      query.insert(projects).values({ id, createdById: crypto.randomUUID() }),
    );
    return id;
  };

  beforeAll(async () => {
    database = createPostgresRuntime({
      url: databaseUrl!,
      schema,
      pool: {
        maxConnections: 3,
        idleTimeoutSeconds: 30,
        connectionTimeoutSeconds: 5,
        maxLifetimeSeconds: 120,
        closeTimeoutSeconds: 5,
      },
    });
    nodes = await projectNodesProvider.make({ postgres: database });
    const http = createFeatureHttp({
      get: async (resource) => (resource === ProjectNodes ? nodes : database) as never,
      ready: async () => undefined,
      close: async () => undefined,
    }).for(coreFeature);
    app = createTopicRoutes(http.controller("test.graph-integrity"));
  });

  afterAll(async () => {
    if (!database) return;
    await database.query(async (query) => {
      await query.execute(sql`DELETE FROM vae_node WHERE ${inArray(sql`project_id`, projectIds)}`);
      await query.delete(deadlines).where(inArray(deadlines.projectId, projectIds));
      await query.delete(subtopics).where(inArray(subtopics.projectId, projectIds));
      await query.delete(topics).where(inArray(topics.projectId, projectIds));
      await query.delete(auditLogs).where(inArray(auditLogs.projectId, projectIds));
      await query.delete(projects).where(inArray(projects.id, projectIds));
    });
    await database.close();
  });

  test("rejects topic cycles, duplicate sibling names and unknown parents", async () => {
    const projectId = await project();
    const root = crypto.randomUUID();
    const child = crypto.randomUUID();
    expect(await status(projectId, { inserts: [topic(root, "Root"), topic(child, "Child", root)] })).toBe(
      200,
    );

    expect(
      await status(projectId, {
        updates: [{ nodeType: "topic", id: root, payload: { parentTopicId: child } }],
      }),
    ).toBe(422);
    expect(await status(projectId, { inserts: [topic(crypto.randomUUID(), "Root")] })).toBe(409);
    expect(
      await status(projectId, { inserts: [topic(crypto.randomUUID(), "Child", root)] }),
    ).toBe(409);
    expect(
      await status(projectId, {
        inserts: [topic(crypto.randomUUID(), "Orphan", crypto.randomUUID())],
      }),
    ).toBe(404);
  });

  test("keeps dependents and references from losing their topic", async () => {
    const projectId = await project();
    const root = crypto.randomUUID();
    const child = crypto.randomUUID();
    const subtopic = crypto.randomUUID();
    const referenced = crypto.randomUUID();
    expect(
      await status(projectId, {
        inserts: [
          topic(root, "Root"),
          topic(child, "Child", root),
          topic(referenced, "Referenced"),
          {
            nodeType: "subtopic",
            id: subtopic,
            payload: {
              topicId: child,
              name: "Subtopic",
              showInMvp: true,
              showInEwm: true,
              showInBeschluss: true,
            },
          },
        ],
      }),
    ).toBe(200);

    expect(await status(projectId, { deletes: [{ nodeType: "topic", id: root }] })).toBe(409);
    expect(await status(projectId, { deletes: [{ nodeType: "topic", id: child }] })).toBe(409);
    expect(
      await status(projectId, {
        inserts: [
          {
            nodeType: "subtopic",
            payload: {
              topicId: crypto.randomUUID(),
              name: "Unbound",
              showInMvp: true,
              showInEwm: true,
              showInBeschluss: true,
            },
          },
        ],
      }),
    ).toBe(404);
    expect(
      await status(projectId, {
        deletes: [
          { nodeType: "subtopic", id: subtopic },
          { nodeType: "topic", id: child },
        ],
      }),
    ).toBe(200);

    await database.query((query) =>
      query.execute(sql`
        INSERT INTO vae_node (id, project_id, project_version, title, text, topic_id)
        VALUES (${crypto.randomUUID()}::uuid, ${projectId}::uuid, 1, 'Chapter', '', ${referenced}::uuid)
      `),
    );
    expect(await status(projectId, { deletes: [{ nodeType: "topic", id: referenced }] })).toBe(409);
  });

  test("requires ordered deadline dates in every node mutation", async () => {
    const projectId = await project();
    const deadline = crypto.randomUUID();
    await expect(
      mutate(projectId, {
        inserts: [{ nodeType: "deadline", payload: { deadlineType: "Missing dates" } }],
      }),
    ).rejects.toMatchObject({ status: 422 });
    expect(
      await status(projectId, {
        inserts: [
          {
            nodeType: "deadline",
            payload: { startAt: "2026-10-31", endAt: "2026-10-01", deadlineType: "Reversed" },
          },
        ],
      }),
    ).toBe(422);
    expect(
      await status(projectId, {
        inserts: [
          {
            nodeType: "deadline",
            id: deadline,
            payload: { startAt: "2026-10-01", endAt: "2026-10-31", deadlineType: "Ordered" },
          },
        ],
      }),
    ).toBe(200);
    expect(
      await status(projectId, {
        updates: [{ nodeType: "deadline", id: deadline, payload: { endAt: "2026-09-30" } }],
      }),
    ).toBe(422);
  });

  test("topic routes apply the same graph rules", async () => {
    const projectId = await project();
    const created = await request("POST", "/topics", { projectId, name: "Parent" });
    expect(created.status, await created.clone().text()).toBe(201);
    const parent = ((await created.json()) as { id: string }).id;
    const nested = await request("POST", "/topics", {
      projectId,
      name: "Nested",
      parentTopicId: parent,
    });
    expect(nested.status).toBe(201);
    const child = ((await nested.json()) as { id: string }).id;

    const cycle = await request("PATCH", `/topics/${parent}`, {
      name: "Parent",
      parentTopicId: child,
    });
    expect(cycle.status).toBe(422);
    expect((await request("DELETE", `/topics/${parent}`)).status).toBe(409);
    expect((await request("DELETE", `/topics/${child}`)).status).toBe(200);
    expect((await request("DELETE", `/topics/${parent}`)).status).toBe(200);
  });
});
