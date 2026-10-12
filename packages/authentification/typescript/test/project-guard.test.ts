import { afterAll, describe, expect, mock, test } from "bun:test";
import {
  machineHeaders,
  offlineResourceId,
  useStrictAuthentication,
} from "@spark-workflow/test-support/strict-auth";
import { Elysia } from "elysia";

import { authentication } from "../src";
import { authenticationErrors } from "../src/errors";

const memberSubject = "00000000-0000-0000-0000-00000000000a";
const strangerSubject = "00000000-0000-0000-0000-00000000000b";
const adminSubject = "00000000-0000-0000-0000-00000000000c";
const memberProject = "project-of-member";

const { checks, stop, userToken } = await useStrictAuthentication([
  `${memberSubject} read project:${memberProject}`,
]);

afterAll(() => {
  stop();
  mock.restore();
});

const app = new Elysia()
  .use(authentication)
  .get("/projects", () => "listed")
  .get("/projects/:projectId", ({ params }) => params.projectId);

const get = (path: string, headers: Record<string, string>) =>
  app.handle(new Request(`http://local${path}`, { headers }));

describe("project read guard", () => {
  test("denies a user without a project relation", async () => {
    const response = await get(
      `/projects/${memberProject}`,
      await userToken(strangerSubject, ["user"]),
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ detail: "Access denied" });
  });

  test("admits a project member", async () => {
    const response = await get(
      `/projects/${memberProject}`,
      await userToken(memberSubject, ["user"]),
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toBe(memberProject);
  });

  test("lets admin and service read any project", async () => {
    const admin = await get(`/projects/${memberProject}`, await userToken(adminSubject, ["admin"]));
    expect(admin.status).toBe(200);
    const service = await get(`/projects/${memberProject}`, machineHeaders);
    expect(service.status).toBe(200);
  });

  test("fails closed when SpiceDB is unreachable", async () => {
    const response = await get(
      `/projects/${offlineResourceId}`,
      await userToken(memberSubject, ["user"]),
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      detail: authenticationErrors.PROVIDER_UNAVAILABLE.message,
    });
  });

  test("leaves routes without a project path untouched", async () => {
    const before = checks.mock.calls.length;
    const response = await get("/projects", await userToken(strangerSubject, ["user"]));
    expect(response.status).toBe(200);
    expect(checks).toHaveBeenCalledTimes(before);
  });
});
