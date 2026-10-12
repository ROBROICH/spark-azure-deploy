import { afterEach, describe, expect, test } from "bun:test";
import { Result } from "better-result";

import { NodeVersionError } from "../src";
import { createProjectLogicClient } from "./fixtures/version-operations/project-logic-client";
import {
  type ProjectLogicFake,
  startProjectLogicFake,
} from "./fixtures/version-operations/project-logic-fake";

const PROJECT = "10000000-0000-4000-8000-000000000001";

describe("app-owned Project Logic version adapter", () => {
  let fake: ProjectLogicFake | undefined;

  afterEach(() => {
    fake?.stop();
    fake = undefined;
  });

  test("uses real TCP with exact paths, bodies, and call accounting", async () => {
    fake = startProjectLogicFake([
      {
        operation: "latest-version",
        projectId: PROJECT,
        result: { status: 200, body: { projectId: PROJECT, latestVersion: 4 } },
      },
      {
        operation: "validate-version-lock",
        projectId: PROJECT,
        input: {
          sourceVersion: 4,
          targetVersion: 5,
          lockToken: "lock-token",
        },
        result: { status: 204 },
      },
    ]);
    const client = createProjectLogicClient(fake.url);

    expect(await client.resolveLatestVersion(PROJECT)).toEqual(Result.ok(4));
    expect(
      await client.validateVersionLock({
        projectId: PROJECT,
        sourceVersion: 4,
        targetVersion: 5,
        lockToken: "lock-token",
      }),
    ).toEqual(Result.ok(undefined));

    expect(fake.calls).toEqual([
      `GET /projects/${PROJECT}/latest-version`,
      `POST /projects/${PROJECT}/version-lock/validate`,
    ]);
    expect(() => fake!.assertComplete()).not.toThrow();
  });

  test("maps the incumbent lock response text to a version conflict", async () => {
    fake = startProjectLogicFake([
      {
        operation: "validate-version-lock",
        projectId: PROJECT,
        input: {
          sourceVersion: 1,
          targetVersion: 2,
          lockToken: "wrong-token",
        },
        result: { status: 409, body: { detail: "lock mismatch" } },
      },
    ]);
    const client = createProjectLogicClient(fake.url);

    expect(
      await client.validateVersionLock({
        projectId: PROJECT,
        sourceVersion: 1,
        targetVersion: 2,
        lockToken: "wrong-token",
      }),
    ).toEqual(
      Result.err(NodeVersionError({ internal: { message: '{"detail":"lock mismatch"}' } })),
    );
    expect(() => fake!.assertComplete()).not.toThrow();
  });

  test("fails closed on undeclared traffic", async () => {
    fake = startProjectLogicFake([]);
    const response = await fetch(new URL(`/projects/${PROJECT}/latest-version?extra=1`, fake.url));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      detail: `Unexpected Project Logic request: GET /projects/${PROJECT}/latest-version?extra=1`,
    });
    expect(() => fake!.assertComplete()).toThrow("Unexpected Project Logic request");
  });
});
