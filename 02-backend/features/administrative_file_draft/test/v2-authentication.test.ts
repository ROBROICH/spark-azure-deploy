import { describe, expect, test } from "bun:test";
import { createFeatureHttp } from "@spark-workflow/http-host";
import type { RiskInsertPayload } from "../src/versioning.ts";

describe("administrative file draft v2 authentication", () => {
  test("challenges every ordinary REST operation before resolving feature resources", async () => {
    const environment = {
      AUTH_MODE: "strict",
      AUTH_BASE_URL: "http://127.0.0.1:1",
      AUTH_REALM: "v2-node-contract",
      AUTH_AUDIENCE: "v2-node-contract",
      AUTH_SPICE_DB_ENDPOINT: "127.0.0.1:1",
      AUTH_SPICE_DB_TOKEN: "v2-node-contract",
      AUTH_SPICE_DB_INSECURE: "true",
    } as const;
    const previous = Object.fromEntries(
      Object.keys(environment).map((name) => [name, process.env[name]]),
    );

    try {
      Object.assign(process.env, environment);
      const { createV2Routes, feature } = await import("../src/index.ts");
      const routes = createV2Routes(
        createFeatureHttp({
          get: async () => {
            throw new Error("Authentication must run before feature resources resolve");
          },
          ready: async () => undefined,
          close: async () => undefined,
        }).for(feature),
      );
      const projectId = "61000000-0000-4000-8000-000000000001";
      const riskId = "62000000-0000-4000-8000-000000000001";
      const collection = `http://local/projects/${projectId}/risks?projectVersion=1`;
      const item = `http://local/projects/${projectId}/risks/${riskId}?projectVersion=1`;

      for (const request of [
        new Request(collection),
        new Request(collection, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            problem: "Missing authentication",
            severity: 1,
            implication: "No Resource may resolve",
            vaeNodeId: riskId,
            status: "open",
          } satisfies RiskInsertPayload),
        }),
        new Request(item),
        new Request(item, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: "{}",
        }),
        new Request(item, { method: "DELETE" }),
      ]) {
        const response = await routes.handle(request);
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
