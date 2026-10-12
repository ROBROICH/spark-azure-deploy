import { describe, expect, test } from "bun:test";
import { Elysia } from "elysia";

import { type FppProjectInput, FppProjectInputSchema } from "../src/schemas.ts";

type FppFile = NonNullable<FppProjectInput["files"]>[number];

const app = new Elysia({ normalize: false }).post("/", () => "stored", { body: FppProjectInputSchema });
const post = (body: FppProjectInput) =>
  app.handle(
    new Request("http://fpp.test/", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

const project = (overrides: Partial<FppProjectInput>): FppProjectInput => ({
  requestId: "30000000-0000-4000-8000-000000000001",
  internalProjectId: "A-F000000-001",
  name: "Ortsumgehung",
  xml: "<fpp/>",
  ...overrides,
});
const file = (overrides: Partial<FppFile> = {}): FppFile => ({
  fileType: "PLANUNTERLAGEN",
  fileUrl: "https://files.fpp.example/plan.zip",
  fileName: "plan.zip",
  ...overrides,
});

describe("FPP project write input budgets", () => {
  test.each([
    ["file count", 1_000, (size: number) => project({ files: Array.from({ length: size }, () => file()) })],
    ["file URL", 1_000, (size: number) => project({ files: [file({ fileUrl: `https://${"u".repeat(size - 8)}` })] })],
    ["file name", 1_000, (size: number) => project({ files: [file({ fileName: "f".repeat(size) })] })],
    ["project name", 1_000, (size: number) => project({ name: "n".repeat(size) })],
    ["internal project id", 1_000, (size: number) => project({ internalProjectId: "i".repeat(size) })],
  ] as const)("%s admits the limit and rejects one more with 422", async (_, limit, body) => {
    expect((await post(body(limit))).status).toBe(200);
    expect((await post(body(limit + 1))).status).toBe(422);
  });
});
