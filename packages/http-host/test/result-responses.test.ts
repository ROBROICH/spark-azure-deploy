import { describe, expect, test } from "bun:test";
import { Result } from "better-result";
import { status, t } from "elysia";
import { createError, type EvlogError } from "evlog";

import { createController, createHttpHost, resultOf } from "../src/index.ts";

process.env.AUTH_MODE = "disabled";

const Project = t.Object({ id: t.String(), name: t.String() }, { additionalProperties: false });

const findProject = async (id: string): Promise<Result<{ id: string; name: string }, EvlogError>> =>
  id === "known"
    ? Result.ok({ id, name: "Known" })
    : Result.err(createError({ status: 404, message: `Project ${id} not found` }));

const app = createHttpHost("result-responses-test").use(
  createController("result-responses-test")
    .get("/projects/:id", ({ params }) => findProject(params.id), { response: resultOf(Project) })
    .post("/projects/:id", async ({ params }) => status(201, await findProject(params.id)), {
      response: { 201: resultOf(Project) },
    })
    .delete("/projects/:id", () => Result.ok(undefined))
    .get("/invalid", () => Result.ok({ id: "known", name: 7 } as never), {
      response: resultOf(Project),
    }),
);

const call = async (method: string, path: string) => {
  const response = await app.handle(new Request(`http://localhost${path}`, { method }));
  return { status: response.status, body: await response.text() };
};

describe("Result responses", () => {
  test("answer the Ok value and the Err through the error handler", async () => {
    expect(await call("GET", "/projects/known")).toEqual({
      status: 200,
      body: JSON.stringify({ id: "known", name: "Known" }),
    });
    expect(await call("GET", "/projects/other")).toEqual({
      status: 404,
      body: JSON.stringify({ detail: "Project other not found" }),
    });
  });

  test("unwrap a Result inside a status response", async () => {
    expect(await call("POST", "/projects/known")).toEqual({
      status: 201,
      body: JSON.stringify({ id: "known", name: "Known" }),
    });
    expect((await call("POST", "/projects/other")).status).toBe(404);
  });

  test("answer an empty body for an Ok without a value", async () => {
    expect(await call("DELETE", "/projects/known")).toEqual({ status: 200, body: "" });
  });

  test("validate the unwrapped value against the response schema", async () => {
    expect((await call("GET", "/invalid")).status).toBe(422);
  });
});
