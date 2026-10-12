import { describe, expect, test } from "bun:test";
import { createFeatureHttp, createHttpHost, type HttpJson } from "@spark-workflow/http-host";
import { PostgreSQL } from "@spark-workflow/postgres-runtime";
import type { ResourceRuntime, ResourceValue } from "@spark-workflow/resource";
import { Elysia } from "elysia";

import { LegalBasisAddRequestSchema } from "../src/contracts.ts";
import { feature } from "../src/manifest.ts";
import { createNormDeconstructionRoutes } from "../src/routes/norm-deconstructions.ts";
import { cachedNorm } from "./support/legal-basis-postgres.ts";

process.env.AUTH_MODE = "disabled";

const topicId = "70000000-0000-4000-8000-000000000001";
const json = (path: string, body: HttpJson) =>
  new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const legalBasis = new Elysia({ normalize: false }).post("/", () => "stored", { body: LegalBasisAddRequestSchema });
const norms = (count: number, jurabk = "BauGB") =>
  Array.from({ length: count }, (_, index) => ({ jurabk, paragraphNr: `${index + 1}` }));

type Available = typeof PostgreSQL | (typeof feature.needs)[keyof typeof feature.needs];

const runtime: ResourceRuntime<Available> = {
  get: async <Value extends Available>() =>
    ({ scope: () => ({}), saveNormDeconstructions: async () => [] }) as ResourceValue<Value>,
  ready: async () => undefined,
  close: async () => undefined,
};
const normDeconstructions = createHttpHost("examination-budget-test").use(
  createNormDeconstructionRoutes(createFeatureHttp(runtime).for(feature)),
);
const deconstructions = (count: number, jurabk = "BauGB") =>
  Array.from({ length: count }, (_, index) => ({
    jurabk,
    paragraph: `${index + 1}`,
    deconstruction: cachedNorm("BauGB", `${index + 1}`),
  }));

describe("Examination write input budgets", () => {
  test.each([
    ["norms", 100, (size: number) => ({ topicId, norms: norms(size) })],
    ["jurabk", 1_000, (size: number) => ({ topicId, norms: norms(1, "j".repeat(size)) })],
  ] as const)("legal-basis %s admits the limit and rejects one more with 422", async (_, limit, body) => {
    expect((await legalBasis.handle(json("/", body(limit)))).status).toBe(200);
    expect((await legalBasis.handle(json("/", body(limit + 1)))).status).toBe(422);
  });

  test.each([
    ["items", 1_000, (size: number) => deconstructions(size)],
    ["jurabk", 1_000, (size: number) => deconstructions(1, "j".repeat(size))],
  ] as const)("norm-deconstruction %s admits the limit and rejects one more with 422", async (_, limit, body) => {
    const path = "/norm-deconstructions/";
    expect((await normDeconstructions.handle(json(path, body(limit)))).status).toBe(200);
    expect((await normDeconstructions.handle(json(path, body(limit + 1)))).status).toBe(422);
  });
});
