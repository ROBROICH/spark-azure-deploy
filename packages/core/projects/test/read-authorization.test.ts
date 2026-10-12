import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { createFeatureHttp } from "@spark-workflow/http-host";
import { createPostgresRuntime, type PostgresResourceRuntime } from "@spark-workflow/postgres-runtime";
import { machineHeaders, useStrictAuthentication } from "@spark-workflow/test-support/strict-auth";
import { inArray } from "drizzle-orm";

import { coreFeature } from "../../src/manifest.ts";
import { coreSchema } from "../../src/schema.ts";
import { deadlines, projects, topics } from "../src/db/schema.ts";
import { createDeadlineRoutes } from "../src/routes/deadlines.ts";
import { createTopicRoutes } from "../src/routes/topics.ts";

const databaseUrl = process.env.PLS_MUTATION_DATABASE_URL;
const member = "7a000000-0000-4000-8000-00000000000a";
const stranger = "7a000000-0000-4000-8000-00000000000b";
const admin = "7a000000-0000-4000-8000-00000000000c";
const memberProject = crypto.randomUUID();
const otherProject = crypto.randomUUID();
const memberTopic = crypto.randomUUID();
const otherTopic = crypto.randomUUID();
const memberDeadline = crypto.randomUUID();
const otherDeadline = crypto.randomUUID();

const reads = (project: string, topic: string, deadline: string) =>
  [
    ["GET", `/topics/${topic}`],
    ["GET", `/topics/${topic}/norms`],
    ["POST", "/topics/batch", [topic]],
    ["GET", `/topics?projectId=${project}`],
    ["GET", `/deadlines/${deadline}`],
  ] as const;

describe.skipIf(databaseUrl === undefined)("project-owned reads by id", () => {
  let database: PostgresResourceRuntime<typeof coreSchema>;
  let app: { handle(request: Request): Promise<Response> };
  let users: Awaited<ReturnType<typeof useStrictAuthentication>>;

  const call = async (
    [method, path, body]: readonly [string, string, unknown?],
    headers: Record<string, string>,
  ) =>
    (
      await app.handle(
        new Request(`http://localhost${path}`, {
          method,
          headers:
            body === undefined ? headers : { ...headers, "content-type": "application/json" },
          body: body === undefined ? undefined : JSON.stringify(body),
        }),
      )
    ).status;

  beforeAll(async () => {
    users = await useStrictAuthentication([`${member} read project:${memberProject}`]);
    database = createPostgresRuntime({
      url: databaseUrl!,
      schema: coreSchema,
      pool: {
        maxConnections: 2,
        idleTimeoutSeconds: 30,
        connectionTimeoutSeconds: 5,
        maxLifetimeSeconds: 120,
        closeTimeoutSeconds: 5,
      },
    });
    const http = createFeatureHttp({
      get: async () => database as never,
      ready: async () => undefined,
      close: async () => undefined,
    }).for(coreFeature);
    app = createDeadlineRoutes(createTopicRoutes(http.controller("test.project-reads")));
    await database.query(async (client) => {
      await client
        .insert(projects)
        .values([memberProject, otherProject].map((id) => ({ id, createdById: member })));
      await client.insert(topics).values(
        [
          [memberTopic, memberProject],
          [otherTopic, otherProject],
        ].map(([id, projectId]) => ({
          id: id!,
          projectId: projectId!,
          name: "Read authorization",
          showInMvp: true,
          showInEwm: true,
          showInBeschluss: true,
        })),
      );
      await client.insert(deadlines).values(
        [
          [memberDeadline, memberProject],
          [otherDeadline, otherProject],
        ].map(([id, projectId]) => ({
          id: id!,
          projectId: projectId!,
          startAt: "2026-08-01",
          endAt: "2026-08-31",
          deadlineType: "Stellungnahme",
        })),
      );
    });
  });

  afterAll(async () => {
    const owned = [memberProject, otherProject];
    await database.query(async (client) => {
      await client.delete(deadlines).where(inArray(deadlines.projectId, owned));
      await client.delete(topics).where(inArray(topics.projectId, owned));
      await client.delete(projects).where(inArray(projects.id, owned));
    });
    await database.close();
    users.stop();
    mock.restore();
  });

  test("denies an unrelated USER every read of another project's topics and deadlines", async () => {
    const headers = await users.userToken(stranger, ["user"]);
    for (const read of reads(otherProject, otherTopic, otherDeadline)) {
      expect(await call(read, headers), read[1]).toBe(403);
    }
  });

  test("admits a project member", async () => {
    const headers = await users.userToken(member, ["user"]);
    for (const read of reads(memberProject, memberTopic, memberDeadline)) {
      expect(await call(read, headers), read[1]).toBe(200);
    }
    expect(await call(["POST", "/topics/batch", [memberTopic, otherTopic]], headers)).toBe(403);
  });

  test("lets admin and service read any project", async () => {
    const adminHeaders = await users.userToken(admin, ["admin"]);
    for (const read of reads(otherProject, otherTopic, otherDeadline)) {
      expect(await call(read, adminHeaders), read[1]).toBe(200);
      expect(await call(read, machineHeaders), read[1]).toBe(200);
    }
  });
});
