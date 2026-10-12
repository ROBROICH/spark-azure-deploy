import { describe, expect, test } from "bun:test";
import { Elysia } from "elysia";

import { AssignTemplateSchema } from "../src/schemas.ts";

describe("POST /templates/:id/assign-template/:projectTypeId body", () => {
  test("accepts the topic rows Project Logic posts", async () => {
    const app = new Elysia().post("/", () => ({ success: true as const }), {
      body: AssignTemplateSchema,
    });
    const response = await app.handle(
      new Request("http://administrative-file-draft.test/", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          topics: [
            {
              id: "56c934c7-eef7-4dc4-8d1b-5441f4e3e86f",
              projectId: "af7def11-8ec2-4e02-b55c-9c31e91806dc",
              parentTopicId: null,
              name: "Artenschutzrecht",
              description:
                "Unter „Artenschutzrecht“ wird geprüft, ob das Vorhaben die Verbotstatbestände erfüllt.",
              showInMvp: true,
              showInEwm: true,
              showInBeschluss: true,
              isDeleted: false,
              createdAt: "2026-06-02T14:28:42.459Z",
              updatedAt: "2026-06-02T14:28:42.459Z",
            },
          ],
        }),
      }),
    );

    expect(response.status).toBe(200);
  });
});
