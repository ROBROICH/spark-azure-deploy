import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createFeatureHttp, type HttpJson } from "@spark-workflow/http-host";
import { createPostgresRuntime, type PostgresResourceRuntime } from "@spark-workflow/postgres-runtime";
import { asc, eq, inArray } from "drizzle-orm";

import { coreFeature } from "../../src/manifest.ts";
import { coreSchema } from "../../src/schema.ts";
import {
  deadlines,
  projects,
  projectStatuses,
  projectTypes,
  projectVersionLocks,
} from "../src/db/schema.ts";
import { ProjectConfiguration } from "../src/resource.ts";
import { createDeadlineRoutes } from "../src/routes/deadlines.ts";

process.env.AUTH_MODE = "disabled";

const databaseUrl = process.env.PLS_MUTATION_DATABASE_URL;
const fixture = `deadline-versions-${crypto.randomUUID()}`;
const projectTypeId = crypto.randomUUID();
const statusId = crypto.randomUUID();
const versioned = crypto.randomUUID();
const otherOwner = crypto.randomUUID();
const locked = crypto.randomUUID();
const projectIds = [versioned, otherOwner, locked];
const copied = crypto.randomUUID();
const legacy = crypto.randomUUID();
const shared = crypto.randomUUID();
const lockedDeadline = crypto.randomUUID();

type DeadlineRow = typeof deadlines.$inferSelect;

describe.skipIf(databaseUrl === undefined)("version-scoped deadline mutations", () => {
  let database: PostgresResourceRuntime<typeof coreSchema>;
  let app: { handle(request: Request): Promise<Response> };

  const request = (method: string, path: string, body?: HttpJson) =>
    app.handle(
      new Request(`http://core.test${path}`, {
        method,
        headers: body === undefined ? undefined : { "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
    );

  const rows = (id: string): Promise<DeadlineRow[]> =>
    database.query((client) =>
      client
        .select()
        .from(deadlines)
        .where(eq(deadlines.id, id))
        .orderBy(asc(deadlines.projectId), asc(deadlines.projectVersion)),
    );

  const stable = (row: DeadlineRow) => ({
    projectId: row.projectId,
    projectVersion: row.projectVersion,
    startAt: row.startAt,
    endAt: row.endAt,
    deadlineType: row.deadlineType,
    legalBasis: row.legalBasis,
    isDeleted: row.isDeleted,
    updatedAt: row.updatedAt.toISOString(),
  });

  beforeAll(async () => {
    database = createPostgresRuntime({
      url: databaseUrl!,
      schema: coreSchema,
      pool: {
        maxConnections: 4,
        idleTimeoutSeconds: 30,
        connectionTimeoutSeconds: 5,
        maxLifetimeSeconds: 120,
        closeTimeoutSeconds: 5,
      },
    });
    const http = createFeatureHttp({
      get: async (resource) =>
        (resource === ProjectConfiguration ? { projectCutOffDate: undefined } : database) as never,
      ready: async () => undefined,
      close: async () => undefined,
    }).for(coreFeature);
    app = createDeadlineRoutes(http.controller("test.deadline-versions"));
    await database.transact(() =>
      database.query(async (client) => {
        await client.insert(projectTypes).values({ id: projectTypeId, name: fixture });
        await client
          .insert(projectStatuses)
          .values({ id: statusId, name: fixture, internalName: fixture });
        await client.insert(projects).values(
          [
            [versioned, 1],
            [versioned, 2],
            [otherOwner, 1],
            [locked, 1],
          ].map(([id, projectVersion]) => ({
            id: id as string,
            projectVersion: projectVersion as number,
            name: `${fixture}-${id}`,
            createdById: "00000000-0000-0000-0000-000000000001",
            internalProjectNumber: `${fixture}-${id}`,
            projectTypeId,
            statusId,
            entryDate: "2026-09-01",
          })),
        );
        const deadline = (id: string, projectId: string, projectVersion: number, type: string) => ({
          id,
          projectId,
          projectVersion,
          startAt: "2026-10-01",
          endAt: "2026-10-31",
          deadlineType: type,
          legalBasis: "§ 1",
        });
        await client
          .insert(deadlines)
          .values([
            deadline(copied, versioned, 1, "copied-v1"),
            deadline(copied, versioned, 2, "copied-v2"),
            deadline(legacy, versioned, 1, "legacy-v1"),
            deadline(shared, versioned, 2, "shared-a"),
            deadline(shared, otherOwner, 1, "shared-b"),
            deadline(lockedDeadline, locked, 1, "locked"),
          ]);
        await client.insert(projectVersionLocks).values({
          id: crypto.randomUUID(),
          projectId: locked,
          sourceVersion: 1,
          targetVersion: 2,
          lockToken: crypto.randomUUID(),
        });
      }),
    );
  });

  afterAll(async () => {
    if (!database) return;
    await database.transact(() =>
      database.query(async (client) => {
        await client
          .delete(projectVersionLocks)
          .where(inArray(projectVersionLocks.projectId, projectIds));
        await client.delete(deadlines).where(inArray(deadlines.projectId, projectIds));
        await client.delete(projects).where(inArray(projects.id, projectIds));
        await client.delete(projectTypes).where(eq(projectTypes.id, projectTypeId));
        await client.delete(projectStatuses).where(eq(projectStatuses.id, statusId));
      }),
    );
    await database.close();
  });

  test("lists one current row per deadline", async () => {
    const response = await request("GET", `/deadlines?projectId=${versioned}`);
    expect(response.status).toBe(200);
    const listed = (await response.json()) as Array<{ id: string; deadlineType: string }>;
    expect(listed.map(({ id, deadlineType }) => [id, deadlineType]).sort()).toEqual(
      [
        [copied, "copied-v2"],
        [legacy, "legacy-v1"],
        [shared, "shared-a"],
      ].sort(),
    );
  });

  test("editing the current version leaves the retained version unchanged", async () => {
    const [before] = await rows(copied);
    const response = await request("PATCH", `/deadlines/${copied}`, {
      endAt: "2026-11-15",
      deadlineType: "edited",
    });
    expect(response.status, await response.clone().text()).toBe(200);
    expect(await response.json()).toMatchObject({
      id: copied,
      projectId: versioned,
      endAt: "2026-11-15",
      deadlineType: "edited",
    });
    const [version1, version2] = await rows(copied);
    expect(stable(version1!)).toEqual(stable(before!));
    expect(version2).toMatchObject({
      projectVersion: 2,
      endAt: "2026-11-15",
      deadlineType: "edited",
    });
  });

  test("editing a deadline that only exists at an older version carries it into the current version", async () => {
    const [before] = await rows(legacy);
    const response = await request("PATCH", `/deadlines/${legacy}`, {
      deadlineType: "legacy-edited",
    });
    expect(response.status, await response.clone().text()).toBe(200);
    expect(await response.json()).toMatchObject({ id: legacy, deadlineType: "legacy-edited" });
    const [version1, version2] = await rows(legacy);
    expect(stable(version1!)).toEqual(stable(before!));
    expect(version2).toMatchObject({
      projectVersion: 2,
      deadlineType: "legacy-edited",
      startAt: "2026-10-01",
      endAt: "2026-10-31",
      legalBasis: "§ 1",
      isDeleted: false,
    });
    const detail = await request("GET", `/deadlines/${legacy}`);
    expect(await detail.json()).toMatchObject({ deadlineType: "legacy-edited" });
  });

  test("deleting the current version keeps earlier versions and hides the deadline", async () => {
    const [before] = await rows(copied);
    const response = await request("DELETE", `/deadlines/${copied}`);
    expect(response.status, await response.clone().text()).toBe(200);
    expect(await response.json()).toMatchObject({ id: copied, deadlineType: "edited" });
    const [version1, version2] = await rows(copied);
    expect(stable(version1!)).toEqual(stable(before!));
    expect(version2).toMatchObject({ projectVersion: 2, isDeleted: true });
    expect((await request("GET", `/deadlines/${copied}`)).status).toBe(404);
    expect((await request("PATCH", `/deadlines/${copied}`, { deadlineType: "x" })).status).toBe(
      404,
    );
    const listed = (await (
      await request("GET", `/deadlines?projectId=${versioned}`)
    ).json()) as Array<{
      id: string;
    }>;
    expect(listed.map(({ id }) => id)).not.toContain(copied);
    const dates = (await (await request("GET", "/deadline-dates?month=2026-11-01")).json()) as {
      dates: string[];
    };
    expect(dates.dates).not.toContain("2026-11-15");
  });

  test("a deadline id shared by two projects is rejected without writes", async () => {
    const before = (await rows(shared)).map(stable);
    for (const [method, body] of [
      ["PATCH", { deadlineType: "hijacked" }],
      ["DELETE", undefined],
    ] as const) {
      const response = await request(method, `/deadlines/${shared}`, body);
      expect(response.status).toBe(409);
    }
    expect((await request("GET", `/deadlines/${shared}`)).status).toBe(409);
    expect((await rows(shared)).map(stable)).toEqual(before);
  });

  test("an active version-copy lock blocks deadline writes", async () => {
    const before = (await rows(lockedDeadline)).map(stable);
    for (const [method, body] of [
      ["PATCH", { deadlineType: "during-copy" }],
      ["DELETE", undefined],
    ] as const) {
      const response = await request(method, `/deadlines/${lockedDeadline}`, body);
      expect(response.status).toBe(409);
    }
    expect((await rows(lockedDeadline)).map(stable)).toEqual(before);

    const created = await request("POST", "/deadlines", {
      projectId: locked,
      startAt: "2026-11-01",
      endAt: "2026-11-30",
      deadlineType: "created-during-copy",
      legalBasis: null,
    });
    expect(created.status).toBe(409);
    const lockedRows = await database.query((client) =>
      client.select().from(deadlines).where(eq(deadlines.projectId, locked)),
    );
    expect(lockedRows.map(({ id }) => id)).toEqual([lockedDeadline]);
  });

  test("a new deadline is created in the current project version", async () => {
    const created = await request("POST", "/deadlines", {
      projectId: versioned,
      startAt: "2026-11-01",
      endAt: "2026-11-30",
      deadlineType: "created-in-v2",
      legalBasis: null,
    });
    expect(created.status).toBe(201);
    const { id } = (await created.json()) as { id: string };
    expect((await rows(id)).map(({ projectVersion }) => projectVersion)).toEqual([2]);
  });
});
