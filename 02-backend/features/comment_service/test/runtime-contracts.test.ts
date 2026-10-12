import { describe, expect, test } from "bun:test";
import { createFeatureHttp } from "@spark-workflow/http-host";
import { PostgreSQL } from "@spark-workflow/postgres-runtime";
import type { ResourceRuntime } from "@spark-workflow/resource";

const unavailableResources: ResourceRuntime<typeof PostgreSQL> = {
  get: async () => {
    throw new Error("This request must not resolve PostgreSQL");
  },
  ready: async () => undefined,
  close: async () => undefined,
};

describe("Comment TypeScript runtime contracts", () => {
  test("returns the shared strict-auth challenge for missing and invalid credentials", async () => {
    const environment = {
      SERVICE_NAME: "comment-auth-contract",
      AUTH_MODE: "strict",
      AUTH_BASE_URL: "http://127.0.0.1:1",
      AUTH_REALM: "review",
      AUTH_AUDIENCE: "review",
      AUTH_SPICE_DB_ENDPOINT: "127.0.0.1:1",
      AUTH_SPICE_DB_TOKEN: "review",
      AUTH_SPICE_DB_INSECURE: "true",
    } as const;
    const previous = Object.fromEntries(
      Object.keys(environment).map((name) => [name, process.env[name]]),
    );
    try {
      Object.assign(process.env, environment);
      const { createRoutes, createV2Routes, feature } = await import("../src/index.ts");
      const http = createFeatureHttp(unavailableResources).for(feature);
      const routes = createRoutes(http);

      for (const authorization of [undefined, "Bearer not-a-jwt"]) {
        const response = await routes.handle(
          new Request(
            "http://local/projects/61000000-0000-4000-8000-000000000001/comments",
            authorization ? { headers: { authorization } } : undefined,
          ),
        );

        expect(response.status).toBe(401);
        expect(response.headers.get("www-authenticate")).toBe("Bearer");
        expect(await response.json()).toEqual({ detail: expect.any(String) });
      }

      const projectId = "61000000-0000-4000-8000-000000000001";
      const commentId = "62000000-0000-4000-8000-000000000001";
      const collection = `http://local/projects/${projectId}/comments`;
      const item = `${collection}/${commentId}`;
      const v2 = createV2Routes(http);
      for (const request of [
        new Request(collection),
        new Request(collection, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            title: "Denied",
            content: "Authentication runs before the Resource.",
            processStep: "unsorted",
          }),
        }),
        new Request(item),
        new Request(item, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: "{}",
        }),
        new Request(item, { method: "DELETE" }),
      ]) {
        const response = await v2.handle(request);
        expect(response.status).toBe(401);
        expect(response.headers.get("www-authenticate")).toBe("Bearer");
      }
    } finally {
      for (const [name, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
    }
  }, 15_000);
});
