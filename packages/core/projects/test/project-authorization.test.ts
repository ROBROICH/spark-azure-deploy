import { afterAll, describe, expect, mock, test } from "bun:test";
import { createFeatureHttp, type HttpJson } from "@spark-workflow/http-host";
import {
  PostgreSQL,
  type PostgreSQLService,
  type PostgresSchema,
  type PostgresScope,
} from "@spark-workflow/postgres-runtime";
import type { ResourceRuntime, ResourceValue } from "@spark-workflow/resource";
import { machineHeaders, useStrictAuthentication } from "@spark-workflow/test-support/strict-auth";
import { Result } from "better-result";

import { coreFeature } from "../../src/manifest.ts";
import { projectErrors } from "../src/errors.ts";
import { createProjectsRoutes, createProjectV2Routes } from "../src/index.ts";
import type { ProjectCreationInput } from "../src/project-creation.ts";
import { Projects, type ProjectsResourceService } from "../src/resource.ts";

const projectId = "73000000-0000-4000-8000-000000000001";
const ownerSubject = "73000000-0000-4000-8000-00000000000a";
const auditorSubject = "73000000-0000-4000-8000-00000000000b";
const foreignSubject = "73000000-0000-4000-8000-00000000000c";

const { stop, userToken } = await useStrictAuthentication([
  `${ownerSubject} read project:${projectId}`,
  `${ownerSubject} create project:${projectId}`,
  `${auditorSubject} read project:${projectId}`,
]);

afterAll(() => {
  stop();
  mock.restore();
});

const emptyDatabase = <Schema extends PostgresSchema>(): PostgresScope<Schema> => ({
  query: async () => {
    throw projectErrors.NOT_FOUND({ message: "No project rows" });
  },
  streamRows: async function* () {
    yield* [];
  },
  transact: (callback) => callback(),
});
const postgres: PostgreSQLService = { scope: emptyDatabase };
const createdProjects: ProjectCreationInput[] = [];
const projects: Pick<ProjectsResourceService, "create"> = {
  create: async (input) => {
    createdProjects.push(input);
    return Result.err(projectErrors.CONFLICT({ message: "Project already exists" }));
  },
};
type Available = typeof PostgreSQL | (typeof coreFeature.needs)[keyof typeof coreFeature.needs];

const runtime: ResourceRuntime<Available> = {
  get: async <Value extends Available>(resource: Value) =>
    (resource === Projects ? projects : postgres) as ResourceValue<Value>,
  ready: async () => undefined,
  close: async () => undefined,
};
const http = createFeatureHttp(runtime).for(coreFeature);
const v1 = createProjectsRoutes(http);
const v2 = createProjectV2Routes(http);

const send = (
  app: typeof v1 | typeof v2,
  method: string,
  path: string,
  headers: Record<string, string>,
  body: HttpJson,
) =>
  app.handle(
    new Request(`http://core.test${path}`, {
      method,
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

const createdBy = async (headers: Record<string, string>, requestedCreator: string) => {
  createdProjects.length = 0;
  await send(v2, "POST", "/projects", headers, {
    name: "Creator binding",
    projectTypeId: "00000000-0000-0000-0000-000000000000",
    createdById: requestedCreator,
    entryDate: "2026-09-25",
    internalProjectNumber: "CREATOR-1",
  });
  return createdProjects.map(({ createdById }) => createdById);
};

const initialize = async (subject: string) =>
  v1.handle(
    new Request(`http://core.test/projects/${projectId}/initialize`, {
      method: "POST",
      headers: await userToken(subject, ["user"]),
    }),
  );

describe("project initialization authorization", () => {
  test("denies a user who may only read the project", async () => {
    const response = await initialize(auditorSubject);
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ detail: "Access denied" });
  });

  test("lets the project owner reach initialization", async () => {
    const response = await initialize(ownerSubject);
    expect(response.status).toBe(404);
  });
});

describe("project creator binding", () => {
  test("makes the calling user the creator whatever creator the body names", async () => {
    expect(await createdBy(await userToken(ownerSubject, ["user"]), foreignSubject)).toEqual([
      ownerSubject,
    ]);
  });

  test("lets a service create a project for a named user", async () => {
    expect(await createdBy(machineHeaders, foreignSubject)).toEqual([foreignSubject]);
  });

  test("rejects a creator change on project updates", async () => {
    for (const app of [v1, v2]) {
      const response = await send(app, "PATCH", `/projects/${projectId}`, machineHeaders, {
        createdById: foreignSubject,
      });
      expect(response.status).toBe(422);
    }
  });
});
