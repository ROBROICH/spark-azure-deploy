import { afterAll, describe, expect, mock, test } from "bun:test";
import {
  machineHeaders,
  machineSubject,
  useStrictAuthentication,
} from "@spark-workflow/test-support/strict-auth";
import { Elysia, t } from "elysia";

import { authentication } from "../src";

type NotAny<Value> = 0 extends 1 & Value ? never : Value;

const { checks, lookups, stop } = await useStrictAuthentication([
  `${machineSubject} read project:project-1`,
  `${machineSubject} read project:project-2`,
]);

afterAll(() => {
  stop();
  mock.restore();
});

let unguardedHandlerRuns = 0;
const unguardedChild = new Elysia().get("/unguarded", () => {
  unguardedHandlerRuns += 1;
  return "unreachable";
});

const app = new Elysia()
  .use(authentication)
  .use(unguardedChild)
  .get("/identity", ({ auth }) => {
    const typed: NotAny<typeof auth> = auth;
    return { subject: typed.user?.sub ?? null };
  })
  .get(
    "/resources/:resourceId",
    ({ auth, params }) => ({ resourceId: params.resourceId, subject: auth.user?.sub }),
    {
      params: t.Object({ resourceId: t.String() }),
      auth: {
        permissions: [{ resource: "project", permission: "read", path: "resourceId" }],
      },
    },
  )
  .post("/workflows", ({ body }) => body, {
    body: t.Object({ workflowId: t.String() }),
    auth: {
      permissions: [{ resource: "workflow", permission: "execute", body: "workflowId" }],
    },
  })
  .get("/lazy", () => "ok")
  .get("/accessible", async ({ auth, status }) => {
    const accessible = await auth.accessibleResourceIds("project", "read");
    return accessible.isErr()
      ? status(accessible.error.status, accessible.error.toJSON())
      : { ids: accessible.value };
  })
  .get("/early/:first/:second", () => "ok", {
    params: t.Object({ first: t.String(), second: t.String() }),
    auth: {
      permissions: [
        { resource: "project", permission: "read", path: "first" },
        { resource: "project", permission: "read", path: "second" },
      ],
    },
  });

describe("authentication plugin", () => {
  test("protects a mounted child even when it forgot an auth policy", async () => {
    const response = await app.handle(new Request("http://local/unguarded"));
    expect(response.status).toBe(401);
    expect(unguardedHandlerRuns).toBe(0);
  });

  test("resolves a typed identity after route validation", async () => {
    const response = await app.handle(
      new Request("http://local/resources/project-1", { headers: machineHeaders }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ resourceId: "project-1", subject: machineSubject });
  });

  test("keeps native visible errors and adds the Bearer challenge", async () => {
    const unauthenticated = await app.handle(new Request("http://local/identity"));
    expect(unauthenticated.status).toBe(401);
    expect(unauthenticated.headers.get("www-authenticate")).toBe("Bearer");
    expect(await unauthenticated.json()).toEqual({
      detail: "Missing or invalid Authorization header",
    });

    const denied = await app.handle(
      new Request("http://local/resources/denied", { headers: machineHeaders }),
    );
    expect(denied.status).toBe(403);
    expect(await denied.json()).toEqual({ detail: "Access denied" });

    const unavailable = await app.handle(
      new Request("http://local/resources/offline", { headers: machineHeaders }),
    );
    expect(unavailable.status).toBe(503);
  });

  test("does not load accessible resources unless the handler asks for them", async () => {
    const before = lookups.mock.calls.length;
    const unused = await app.handle(new Request("http://local/lazy", { headers: machineHeaders }));
    expect(unused.status).toBe(200);
    expect(lookups).toHaveBeenCalledTimes(before);

    const used = await app.handle(
      new Request("http://local/accessible", { headers: machineHeaders }),
    );
    expect(await used.json()).toEqual({ ids: ["project-1", "project-2"] });
    expect(lookups).toHaveBeenCalledTimes(before + 1);
  });

  test("stops permission checks at the first denial", async () => {
    const before = checks.mock.calls.length;
    const response = await app.handle(
      new Request("http://local/early/denied/should-not-run", { headers: machineHeaders }),
    );
    expect(response.status).toBe(403);
    expect(checks).toHaveBeenCalledTimes(before + 1);
  });

  test("validates request bodies before resolving permissions", async () => {
    const before = checks.mock.calls.length;
    const invalid = await app.handle(
      new Request("http://local/workflows", {
        method: "POST",
        headers: { ...machineHeaders, "content-type": "application/json" },
        body: "{}",
      }),
    );
    expect(invalid.status).toBe(422);
    expect(checks).toHaveBeenCalledTimes(before);

    const empty = await app.handle(
      new Request("http://local/workflows", {
        method: "POST",
        headers: { ...machineHeaders, "content-type": "application/json" },
        body: JSON.stringify({ workflowId: "   " }),
      }),
    );
    expect(empty.status).toBe(400);
    expect(checks).toHaveBeenCalledTimes(before);
  });
});
