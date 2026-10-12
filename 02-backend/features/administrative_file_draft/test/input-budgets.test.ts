import { describe, expect, test } from "bun:test";
import type { HttpJson } from "@spark-workflow/http-host";
import type { TSchema } from "@sinclair/typebox";
import { Elysia } from "elysia";

import { AssignTemplateSchema, CreateRisksSchema, UpdateRiskSchema } from "../src/schemas.ts";

const post = (schema: TSchema, body: HttpJson) =>
  new Elysia({ normalize: false })
    .post("/", () => "stored", { body: schema })
    .handle(
      new Request("http://administrative-file-draft.test/", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
    );

const risk = (problem = "Lärmschutz fehlt") => ({
  problem,
  recommendation: null,
  severity: 5,
  implication: "Nachforderung",
  vaeNodeId: "40000000-0000-4000-8000-000000000001",
});
const topics = (count: number, name = "Artenschutzrecht") =>
  Array.from({ length: count }, (_, index) => ({
    id: `56c934c7-eef7-4dc4-8d1b-${`${index}`.padStart(12, "0")}`,
    name,
  }));

describe("Administrative File Draft write input budgets", () => {
  test.each([
    ["risk count", CreateRisksSchema, 1_000, (size: number) => ({ risks: Array.from({ length: size }, () => risk()) })],
    ["risk text", CreateRisksSchema, 50_000, (size: number) => ({ risks: [risk("p".repeat(size))] })],
    ["updated risk text", UpdateRiskSchema, 50_000, (size: number) => ({ implication: "i".repeat(size) })],
    ["template topic count", AssignTemplateSchema, 1_000, (size: number) => ({ topics: topics(size) })],
    ["template topic name", AssignTemplateSchema, 1_000, (size: number) => ({ topics: topics(1, "t".repeat(size)) })],
  ] as const)("%s admits the limit and rejects one more with 422", async (_, schema, limit, body) => {
    expect((await post(schema, body(limit))).status).toBe(200);
    expect((await post(schema, body(limit + 1))).status).toBe(422);
  });

  test("risk creation rejects undeclared fields with 422", async () => {
    expect((await post(CreateRisksSchema, { risks: [{ ...risk(), status: "open" }] })).status).toBe(422);
    expect((await post(CreateRisksSchema, { risks: [risk()], projectId: "p" })).status).toBe(422);
  });
});
