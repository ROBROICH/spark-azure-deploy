import { describe, expect, test } from "bun:test";
import { DocumentFiles } from "@spark-workflow/core/documents/resource";
import { Projects } from "@spark-workflow/core/projects/resource";
import { createFeatureHttp } from "@spark-workflow/http-host";
import { PostgreSQL } from "@spark-workflow/postgres-runtime";
import type { ResourceRuntime } from "@spark-workflow/resource";
import { Type, type TSchema } from "@sinclair/typebox";
import { Elysia } from "elysia";

process.env.AUTH_MODE = "disabled";

const supplementaryModule = await import("../src/index.ts");
const { SupplementaryRequestResponse } = await import("../src/db/schemas.ts");

const unavailableResources: ResourceRuntime<
  typeof PostgreSQL | typeof Projects | typeof DocumentFiles
> = {
  get: async () => {
    throw new Error("This request must not resolve runtime resources");
  },
  ready: async () => undefined,
  close: async () => undefined,
};

const routes = supplementaryModule.createRoutes(
  createFeatureHttp(unavailableResources).for(supplementaryModule.feature),
);

async function responseJson(path: string, init?: RequestInit) {
  const response = await routes.handle(new Request(`http://service.test${path}`, init));
  return { status: response.status, body: await response.json() };
}

describe("Supplementary Requests Elysia contract", () => {
  test("exposes request-contract failures before any database contact", async () => {
    for (const [path, init] of [
      ["/projects/not-a-uuid/supplementary-requests", undefined],
      [
        "/projects/81000000-0000-4000-8000-000000000001/supplementary-requests?limit=1.5",
        undefined,
      ],
      [
        "/projects/81000000-0000-4000-8000-000000000001/supplementary-requests",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ priority: "must" }),
        },
      ],
    ] as const) {
      const response = await responseJson(path, init);
      expect(response.status).toBe(422);
    }
  });

  test("list response accepts drizzle Date timestamps", async () => {
    const createdAt = new Date("2026-06-04T10:17:01.105Z");
    const schemaApp = new Elysia().get(
      "/",
      () => [
        {
          id: "c3459bef-cf05-4072-8687-5b1e3abe854b",
          projectId: "34840243-a838-490b-9aa5-90ba75fde067",
          title: "Schallgutachten Bauphase",
          reason: "Lärm- und Staubbelastung während der Bauphase nicht ausreichend belegt.",
          priority: "must",
          sourceRef: null,
          includedInLetter: false,
          topicId: "00000000-0000-0000-0000-000000000000",
          documentId: "00000000-0000-0000-0000-000000000000",
          createdAt: createdAt,
          updatedAt: createdAt,
        },
      ],
      {
        response: Type.Array(SupplementaryRequestResponse) as TSchema,
      },
    );
    const response = await schemaApp.handle(new Request("http://supplementary-requests.test/"));
    expect(response.status).toBe(200);
    expect((await response.json())[0]).toMatchObject({
      createdAt: "2026-06-04T10:17:01.105Z",
      updatedAt: "2026-06-04T10:17:01.105Z",
    });
  });
});
