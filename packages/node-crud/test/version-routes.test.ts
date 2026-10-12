import { beforeEach, describe, expect, test } from "bun:test";
import { authentication } from "@spark-workflow/authentification";
import { Result } from "better-result";
import { Elysia } from "elysia";
import type { EvlogError } from "evlog";

import {
  bindNodeRuntime,
  createNodeVersionRoutes,
  defineNodeDescriptor,
  NodeVersionError,
  type ProjectVersionPeer,
  type NodeJson,
} from "../src";
import {
  representativeNodeMetadata,
  representativeSchema,
} from "./fixtures/representative-app/schema";
import { emptyNodeRowStream } from "./support/persistence";

process.env.AUTH_MODE = "disabled";

const PROJECT = "10000000-0000-4000-8000-000000000001";
const NODE = "20000000-0000-4000-8000-000000000001";

const databaseTrap = new Proxy(
  {},
  {
    get() {
      throw new Error("database must not be reached before version preconditions pass");
    },
  },
);

const descriptor = defineNodeDescriptor<typeof representativeSchema>({
  name: "version-route-representative",
  auditLogEnabled: true,
  schema: representativeSchema,
  nodeMetadata: representativeNodeMetadata,
});

describe("named Elysia project-version routes", () => {
  const calls: string[] = [];
  let latestVersion = 3;
  let lockError: EvlogError | undefined;
  const peer: ProjectVersionPeer = {
    validateWriteVersion: async () => Result.ok(undefined),
    async resolveLatestVersion(projectId) {
      calls.push(`latest:${projectId}`);
      return Result.ok(latestVersion);
    },
    async validateVersionLock({ projectId, sourceVersion, targetVersion, lockToken }) {
      calls.push(`lock:${projectId}:${sourceVersion}:${targetVersion}:${lockToken}`);
      return lockError ? Result.err(lockError) : Result.ok(undefined);
    },
  };
  const runtime = bindNodeRuntime(descriptor, {
    persistence: {
      query: async (callback) => callback(databaseTrap as never),
      streamRows: emptyNodeRowStream,
      transact: async (callback) => {
        calls.push("transaction");
        return callback();
      },
    },
    versionPeer: peer,
  });
  const routes = createNodeVersionRoutes(
    new Elysia({ normalize: false }).use(authentication),
    descriptor,
    () => runtime,
  );

  beforeEach(() => {
    calls.length = 0;
    latestVersion = 3;
    lockError = undefined;
  });

  const post = (path: string, body: NodeJson) =>
    routes.handle(
      new Request(`http://node.test${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
    );

  test("rejects invalid copy input before the peer or database", async () => {
    const response = await post(`/${PROJECT}/copy-version`, {
      sourceVersion: 1,
      targetVersion: 2,
      lockToken: "lock-token",
      dryRun: true,
      nodes: [{ nodeType: "unknown", id: NODE }],
    });
    expect(response.status).toBe(422);
    expect(calls).toEqual([]);
  });

  test("rejects invalid undo input before the peer or database", async () => {
    const response = await post(`/${PROJECT}/undo-version`, {
      targetVersion: 0,
      lockToken: "lock-token",
    });
    expect(response.status).toBe(422);
    expect(calls).toEqual([]);
  });

  test("rejects target ordering before opening a transaction", async () => {
    const response = await post(`/${PROJECT}/copy-version`, {
      sourceVersion: 2,
      targetVersion: 2,
      lockToken: "lock-token",
      dryRun: true,
      nodes: [],
    });
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      detail: "targetVersion must be greater than sourceVersion",
    });
    expect(calls).toEqual([]);
  });

  test("rejects undeclared override fields before the peer or database", async () => {
    const response = await post(`/${PROJECT}/copy-version`, {
      sourceVersion: 1,
      targetVersion: 2,
      lockToken: "lock-token",
      dryRun: true,
      nodes: [{ nodeType: "author", id: NODE, overrides: { unknown: true } }],
    });
    expect(response.status).toBe(422);
    expect(calls).toEqual([]);
  });

  test("maps peer lock conflicts without reaching persistence", async () => {
    lockError = NodeVersionError({ internal: { message: "lock conflict" } });
    const response = await post(`/${PROJECT}/copy-version`, {
      sourceVersion: 1,
      targetVersion: 2,
      lockToken: "wrong-token",
      dryRun: false,
      nodes: [],
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ detail: "Project version conflict" });
    expect(calls).toEqual(["transaction", `lock:${PROJECT}:1:2:wrong-token`]);
  });

  test("maps conflicting duplicate overrides before opening a transaction", async () => {
    const response = await post(`/${PROJECT}/copy-version`, {
      sourceVersion: 1,
      targetVersion: 2,
      lockToken: "lock-token",
      dryRun: true,
      nodes: [
        { nodeType: "author", id: NODE, overrides: { name: "First" } },
        { nodeType: "author", id: NODE, overrides: { name: "Second" } },
      ],
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ detail: "Project version conflict" });
    expect(calls).toEqual([]);
  });

  test("resolves latest, validates the lock, then rejects unsafe undo", async () => {
    latestVersion = 3;
    const response = await post(`/${PROJECT}/undo-version`, {
      targetVersion: 3,
      lockToken: "lock-token",
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      detail: "undo-version requires latest version to be lower than targetVersion",
    });
    expect(calls).toEqual(["transaction", `latest:${PROJECT}`, `lock:${PROJECT}:3:3:lock-token`]);
  });
});
