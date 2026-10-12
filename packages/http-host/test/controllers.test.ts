import { describe, expect, test } from "bun:test";

import {
  createController,
  createHttpHost,
  createHttpHostState,
  createPublicController,
} from "../src/index.ts";

Object.assign(process.env, {
  AUTH_MODE: "strict",
  AUTH_BASE_URL: "http://identity.invalid",
  AUTH_REALM: "test",
  AUTH_AUDIENCE: "test",
  AUTH_ALLOWED_MACHINE_IDENTITIES: "spiffe://cluster/ns/test/sa/test",
});

const app = createHttpHost("http-host-controllers")
  .use(createPublicController("public").get("/public", () => ({ status: "ok" as const })))
  .use(
    createController("private").get("/private", () => ({ status: "ok" as const }), {
      auth: {},
    }),
  );

describe("HTTP host controllers", () => {
  test("keeps public controllers outside authentication", async () => {
    const response = await app.handle(new Request("http://localhost/public"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  });

  test("gives feature controllers the authentication macro", async () => {
    const response = await app.handle(new Request("http://localhost/private"));

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toBe("Bearer");
  });

  test("reports startup, acceptance, and draining without probing dependencies", async () => {
    const state = createHttpHostState();
    const stateful = createHttpHost("http-host-state", { state });

    expect((await stateful.handle(new Request("http://localhost/healthz"))).status).toBe(200);
    expect((await stateful.handle(new Request("http://localhost/startup"))).status).toBe(503);
    expect((await stateful.handle(new Request("http://localhost/ready"))).status).toBe(503);

    state.markAccepting();
    expect((await stateful.handle(new Request("http://localhost/startup"))).status).toBe(200);
    expect((await stateful.handle(new Request("http://localhost/ready"))).status).toBe(200);

    state.markDraining();
    expect((await stateful.handle(new Request("http://localhost/healthz"))).status).toBe(200);
    const draining = await stateful.handle(new Request("http://localhost/ready"));
    expect(draining.status).toBe(503);
    expect(await draining.json()).toEqual({ status: "draining" });
  });
});
