import { describe, expect, test } from "bun:test";
import type { Static } from "@sinclair/typebox";
import { Elysia } from "elysia";

import { ProjectAssignmentsRequest } from "../src/routes/assignments.ts";

const app = new Elysia({ normalize: false }).post("/", () => "stored", { body: ProjectAssignmentsRequest });
const post = (body: Static<typeof ProjectAssignmentsRequest>) =>
  app.handle(
    new Request("http://identity.test/", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

describe("Project assignment write input budgets", () => {
  test.each([
    [
      "assignment count",
      (size: number) => ({
        assignments: Array.from({ length: size }, (_, index) => ({ role: "member" as const, userId: `user-${index}` })),
      }),
    ],
    ["user id", (size: number) => ({ assignments: [{ role: "owner" as const, userId: "u".repeat(size) }] })],
  ] as const)("%s admits 1000 and rejects 1001 with 422", async (_, body) => {
    expect((await post(body(1_000))).status).toBe(200);
    expect((await post(body(1_001))).status).toBe(422);
  });
});
