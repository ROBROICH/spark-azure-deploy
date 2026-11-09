import { afterAll, describe, expect, mock, test } from "bun:test";
import {
  currentAuditContext,
  withAuditContext,
  type AuditContext,
} from "@spark-workflow/audit-client";
import { machineSubject, useStrictAuthentication } from "@spark-workflow/test-support/strict-auth";
import { Elysia } from "elysia";

import { authentication } from "../src";
import type { NormalizedIdentity } from "../src/identity";

const memberSubject = "00000000-0000-0000-0000-00000000000a";
const triggeredBySubject = "00000000-0000-0000-0000-00000000000f";

const { stop, userToken } = await useStrictAuthentication([]);
process.env.DANGEROUS_ZERO_TRUST_DISABLED = "true";

afterAll(() => {
  stop();
  mock.restore();
});

const app = new Elysia()
  .use(authentication)
  .get("/whoami", ({ auth }) => ({ user: auth.user, audit: currentAuditContext() }));

type WhoAmI = { user: NormalizedIdentity | null; audit: AuditContext };

const get = (headers: Record<string, string>) =>
  withAuditContext({}, () => app.handle(new Request("http://local/whoami", { headers })));

describe("strict mode with zero trust disabled", () => {
  test("WHEN a request has no Authorization header THEN it is the service caller and adopts the forwarded audit context", async () => {
    const response = await get({
      "x-triggered-by-user-id": triggeredBySubject,
      "x-workflow-run-id": "run-1",
    });
    expect(response.status).toBe(200);
    expect((await response.json()) as WhoAmI).toMatchObject({
      user: { sub: machineSubject, role: "service" },
      audit: {
        actorUserId: machineSubject,
        triggeredByUserId: triggeredBySubject,
        workflowRunId: "run-1",
      },
    });
  });

  test("WHEN the Authorization header carries no Bearer token THEN it is the service caller", async () => {
    const response = await get({ authorization: "Basic dXNlcjpwYXNz" });
    expect(response.status).toBe(200);
    expect(((await response.json()) as WhoAmI).user).toMatchObject({ role: "service" });
  });

  test("WHEN a request carries a valid Bearer token THEN it is the token's user", async () => {
    const response = await get(await userToken(memberSubject, ["user"]));
    expect(response.status).toBe(200);
    expect(((await response.json()) as WhoAmI).user).toMatchObject({
      sub: memberSubject,
      kind: "human",
    });
  });

  test("WHEN a request carries an invalid Bearer token THEN it is rejected instead of becoming the service caller", async () => {
    const response = await get({ authorization: "Bearer not-a-jwt" });
    expect(response.status).toBe(401);
  });
});
