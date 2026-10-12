import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { deleteRelationship, touchRelationship } from "@spark-workflow/authentification";
import { createFeatureHttp } from "@spark-workflow/http-host";
import { createPostgresRuntime, type PostgresResourceRuntime } from "@spark-workflow/postgres-runtime";
import { and, eq, inArray } from "drizzle-orm";

import { coreFeature } from "../../src/manifest.ts";
import { coreSchema } from "../../src/schema.ts";
import { deadlines, projects, projectStatuses, projectTypes, projectVersionLocks } from "../src/db/schema.ts";
import { ProjectConfiguration } from "../src/resource.ts";
import { createProjectRoutes } from "../src/routes/projects.ts";
import { createDeadlineRoutes } from "../src/routes/deadlines.ts";

const databaseUrl = process.env.PLS_MUTATION_DATABASE_URL;
const fixtureIds = Array.from({ length: 55 }, () => crypto.randomUUID());
const memberProject = fixtureIds[54]!;
const fixtureName = `release-collections-${crypto.randomUUID()}`;
const systemOwner = "00000000-0000-0000-0000-000000000001";
const projectTypeId = crypto.randomUUID();
const statusId = crypto.randomUUID();
const humanProjectId = crypto.randomUUID();
const humanProjectName = `release-human-${crypto.randomUUID()}`;
const deadlineIds = Array.from({ length: 57 }, () => crypto.randomUUID());

describe.skipIf(databaseUrl === undefined)("project list complete-dataset paging", () => {
  let database: PostgresResourceRuntime<typeof coreSchema>;
  let app: { handle(request: Request): Promise<Response> };
  let adminHeaders: Headers;
  let memberHeaders: Headers;
  let serviceHeaders: Headers;
  let admin: string;
  let member: string;
  const relationships: Parameters<typeof touchRelationship>[0][] = [];

  const list = async (query: string, headers: Headers, name = fixtureName) => {
    const response = await app.handle(new Request(`http://core.test/projects?name=${name}&${query}`, { headers }));
    expect(response.status, await response.clone().text()).toBe(200);
    return await response.json() as Array<{ id: string }>;
  };

  beforeAll(async () => {
    const adminToken = process.env.COLLECTIONS_ADMIN_TOKEN;
    const memberToken = process.env.COLLECTIONS_MEMBER_TOKEN;
    const adminSubject = process.env.COLLECTIONS_ADMIN_SUB;
    const memberSubject = process.env.COLLECTIONS_MEMBER_SUB;
    const machineUri = process.env.COLLECTIONS_MACHINE_URI;
    if (process.env.AUTH_MODE !== "strict" || !adminToken || !memberToken || !adminSubject || !memberSubject || !machineUri) {
      throw new Error("Native strict AUTH_*, COLLECTIONS_ADMIN_TOKEN, COLLECTIONS_MEMBER_TOKEN, COLLECTIONS_ADMIN_SUB, COLLECTIONS_MEMBER_SUB and COLLECTIONS_MACHINE_URI are required");
    }
    admin = adminSubject;
    member = memberSubject;
    adminHeaders = new Headers({ Authorization: `Bearer ${adminToken}` });
    memberHeaders = new Headers({ Authorization: `Bearer ${memberToken}` });
    serviceHeaders = new Headers({ "x-forwarded-client-cert": `URI=${machineUri}` });
    database = createPostgresRuntime({
      url: databaseUrl!,
      schema: coreSchema,
      pool: { maxConnections: 2, idleTimeoutSeconds: 30, connectionTimeoutSeconds: 5, maxLifetimeSeconds: 120, closeTimeoutSeconds: 5 },
    });
    const http = createFeatureHttp({
      get: async (resource) => (resource === ProjectConfiguration ? { projectCutOffDate: undefined } : database) as never,
      ready: async () => undefined,
      close: async () => undefined,
    }).for(coreFeature);
    app = createDeadlineRoutes(createProjectRoutes(http.controller("test.project-list")));
    await database.query((client) => client.insert(projectTypes).values({ id: projectTypeId, name: fixtureName }));
    await database.query((client) => client.insert(projectStatuses).values({ id: statusId, name: "Open", internalName: "OPEN" }));
    await database.query((client) => client.insert(projects).values(fixtureIds.map((id, index) => ({
      id,
      name: `${fixtureName}-${index === 51 ? "A1" : index === 52 ? "A2" : index === 53 ? "A10" : String(index).padStart(2, "0")}`,
      createdById: systemOwner,
      imported: true,
      internalProjectNumber: `${fixtureName}-${index}`,
      projectTypeId,
      statusId,
      entryDate: "2026-09-01",
    }))));
    await database.query((client) => client.insert(projects).values({
      id: humanProjectId, name: humanProjectName, createdById: member,
      internalProjectNumber: humanProjectName, projectTypeId, statusId, entryDate: "2026-09-01",
    }));
    await database.query((client) => client.insert(deadlines).values(deadlineIds.map((id, index) => ({
      id,
      projectId: index === 56 ? fixtureIds[0]! : memberProject,
      deadlineType: "Review",
      startAt: index === 56 ? "2026-09-29" : index === 55 ? "2026-09-30" : "2026-09-26",
      endAt: index === 56 ? "2026-09-29" : index === 55 ? "2026-10-01" : "2026-09-27",
    }))));
    relationships.push(
      ...fixtureIds.map((resourceId) => ({ resourceType: "project" as const, resourceId, relation: "owner" as const, subjectId: systemOwner })),
      { resourceType: "project", resourceId: memberProject, relation: "member", subjectId: admin },
      { resourceType: "project", resourceId: memberProject, relation: "member", subjectId: member },
      { resourceType: "project", resourceId: fixtureIds[53]!, relation: "auditor", subjectId: admin },
      { resourceType: "project", resourceId: humanProjectId, relation: "owner", subjectId: member },
    );
    for (const relationship of relationships) {
      const result = await touchRelationship(relationship);
      if (result.isErr()) throw result.error;
    }
  });

  afterAll(async () => {
    for (const relationship of relationships) {
      const result = await deleteRelationship(relationship);
      if (result.isErr()) throw result.error;
    }
    if (database) {
      await database.query((client) => client.delete(deadlines).where(inArray(deadlines.id, deadlineIds)));
      await database.query((client) => client.delete(projects).where(inArray(projects.id, [...fixtureIds, humanProjectId])));
      await database.query((client) => client.delete(projectTypes).where(eq(projectTypes.id, projectTypeId)));
      await database.query((client) => client.delete(projectStatuses).where(eq(projectStatuses.id, statusId)));
      await database.close();
    }
  });

  test("makes system-owned projects discoverable to admins through the existing name filter", async () => {
    expect((await list("", adminHeaders, `${fixtureName}-0`)).map(({ id }) => id).sort())
      .toEqual(fixtureIds.slice(0, 10).sort());
    expect(await list("", memberHeaders, `${fixtureName}-0`)).toEqual([]);
  });

  test("lets admins discover system-owned projects in bounded pages and select mine beyond page one", async () => {
    const first = await list("limit=50&offset=0&sort=name&direction=asc", adminHeaders);
    const second = await list("limit=50&offset=50&sort=name&direction=asc", adminHeaders);
    expect(first).toHaveLength(50);
    expect(second).toHaveLength(5);
    expect([...first, ...second].map(({ id }) => id).sort()).toEqual([...fixtureIds].sort());
    expect(await list("assignment=mine&limit=50&offset=0", adminHeaders)).toEqual([
      expect.objectContaining({ id: memberProject }),
    ]);
  });

  test("preserves natural text ordering across project list page boundaries", async () => {
    const first = await list("limit=2&offset=0&sort=name&direction=asc", adminHeaders, `${fixtureName}-A`);
    const second = await list("limit=2&offset=2&sort=name&direction=asc", adminHeaders, `${fixtureName}-A`);
    expect(first.map(({ id }) => id)).toEqual([fixtureIds[51]!, fixtureIds[52]!]);
    expect(second.map(({ id }) => id)).toEqual([fixtureIds[53]!]);
  });

  test("preserves normal-user and machine ownership bounds when all is requested", async () => {
    expect(await list("assignment=all&limit=50&offset=0", memberHeaders)).toEqual([
      expect.objectContaining({ id: memberProject }),
    ]);
    expect((await list("assignment=all&limit=200&offset=0", serviceHeaders)).map(({ id }) => id).sort())
      .toEqual([...fixtureIds].sort());
    expect(await list("", serviceHeaders, humanProjectName)).toEqual([]);
    expect(await list("", adminHeaders, humanProjectName)).toEqual([
      expect.objectContaining({ id: humanProjectId }),
    ]);
  });


  test("checks project-number availability independently of loaded list pages", async () => {
    const value = encodeURIComponent(` ${fixtureName.toUpperCase()}-54 `);
    const occupied = await app.handle(new Request(
      `http://core.test/projects/internal-number-availability?value=${value}`,
      { headers: adminHeaders },
    ));
    expect(occupied.status, await occupied.clone().text()).toBe(200);
    expect(await occupied.json()).toEqual({ available: false });
    const unchanged = await app.handle(new Request(
      `http://core.test/projects/internal-number-availability?value=${value}&excludeProjectId=${memberProject}`,
      { headers: adminHeaders },
    ));
    expect(unchanged.status, await unchanged.clone().text()).toBe(200);
    expect(await unchanged.json()).toEqual({ available: true });
  });

  test("does not expose unrelated project numbers to ordinary users or machines", async () => {
    for (const [value, headers] of [[`${fixtureName}-0`, memberHeaders], [humanProjectName, serviceHeaders]] as const) {
      const response = await app.handle(new Request(
        `http://core.test/projects/internal-number-availability?value=${encodeURIComponent(value)}`,
        { headers },
      ));
      expect(response.status, await response.clone().text()).toBe(200);
      expect(await response.json()).toEqual({ available: true });
    }
  });

  test("checks numbers on the active version including lock source precedence", async () => {
    const currentNumber = `${humanProjectName}-current`;
    await database.query((client) => client.insert(projects).values({
      id: humanProjectId, projectVersion: 2, name: humanProjectName, createdById: member,
      internalProjectNumber: currentNumber, projectTypeId, statusId, entryDate: "2026-09-01",
    }));
    try {
      for (const locked of [false, true]) {
        if (locked) {
          await database.query((client) => client.insert(projectVersionLocks).values({
            id: crypto.randomUUID(), projectId: humanProjectId, sourceVersion: 1,
            targetVersion: 2, lockToken: crypto.randomUUID(),
          }));
        }
        for (const [value, available] of [[humanProjectName, !locked], [currentNumber, locked]] as const) {
          const response = await app.handle(new Request(
            `http://core.test/projects/internal-number-availability?value=${encodeURIComponent(value)}`,
            { headers: adminHeaders },
          ));
          expect(response.status, await response.clone().text()).toBe(200);
          expect(await response.json()).toEqual({ available });
        }
      }
    } finally {
      await database.query((client) => client.delete(projectVersionLocks).where(eq(projectVersionLocks.projectId, humanProjectId)));
      await database.query((client) => client.delete(projects).where(and(eq(projects.id, humanProjectId), eq(projects.projectVersion, 2))));
    }
  });

  test("bounds deadline lists and pages every event on the selected calendar date", async () => {
    const initial = await app.handle(new Request(
      `http://core.test/deadlines?projectId=${memberProject}`,
      { headers: memberHeaders },
    ));
    expect(initial.status, await initial.clone().text()).toBe(200);
    expect(await initial.json()).toHaveLength(50);
    const first = await app.handle(new Request(
      `http://core.test/deadlines?projectId=${memberProject}&date=2026-09-27&limit=50&offset=0`,
      { headers: memberHeaders },
    ));
    const second = await app.handle(new Request(
      `http://core.test/deadlines?projectId=${memberProject}&date=2026-09-27&limit=50&offset=50`,
      { headers: memberHeaders },
    ));
    expect(first.status, await first.clone().text()).toBe(200);
    expect(second.status, await second.clone().text()).toBe(200);
    const firstPage = await first.json() as Array<{ id: string }>;
    const secondPage = await second.json() as Array<{ id: string }>;
    expect(firstPage).toHaveLength(50);
    expect(secondPage).toHaveLength(5);
    expect([...firstPage, ...secondPage].map(({ id }) => id).sort()).toEqual(deadlineIds.slice(0, 55).sort());
  });

  test("selects an upcoming deadline after earlier event pages without loading them", async () => {
    const upcoming = await app.handle(new Request(
      `http://core.test/deadlines?projectId=${memberProject}&endingOnOrAfter=2026-09-30&limit=1&offset=0`,
      { headers: memberHeaders },
    ));
    expect(upcoming.status, await upcoming.clone().text()).toBe(200);
    expect(await upcoming.json()).toEqual([expect.objectContaining({ id: deadlineIds[55]! })]);
  });

  test("returns complete month markers independently of event pages without unrelated project dates", async () => {
    const markers = await app.handle(new Request(
      "http://core.test/deadline-dates?month=2026-09-01",
      { headers: memberHeaders },
    ));
    expect(markers.status, await markers.clone().text()).toBe(200);
    expect(await markers.json()).toEqual({ dates: ["2026-09-26", "2026-09-27", "2026-09-30"] });
  });
});
