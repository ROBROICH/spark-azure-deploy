import { beforeAll, expect, test } from "bun:test";
import { Elysia } from "elysia";

import { authentication } from "../src";

beforeAll(() => {
  process.env.AUTH_MODE = "disabled";
});

test("project read guard passes every request when authentication is disabled", async () => {
  const app = new Elysia()
    .use(authentication)
    .get("/projects/:projectId", ({ params }) => params.projectId);
  const response = await app.handle(new Request("http://local/projects/any-project"));
  expect(response.status).toBe(200);
  expect(await response.text()).toBe("any-project");
});
