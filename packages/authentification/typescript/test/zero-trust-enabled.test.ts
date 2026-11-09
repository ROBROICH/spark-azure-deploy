import { afterAll, describe, expect, mock, test } from "bun:test";
import {
  currentAuditContext,
  withAuditContext,
  type AuditContext,
} from "@spark-workflow/audit-client";
import {
  machineHeaders,
  machineSubject,
  useStrictAuthentication,
} from "@spark-workflow/test-support/strict-auth";
import { Elysia } from "elysia";

import { authentication } from "../src";
import type { NormalizedIdentity } from "../src/identity";

const triggeredBySubject = "00000000-0000-0000-0000-00000000000f";

const { stop } = await useStrictAuthentication([]);

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

describe("strict mode with zero trust enabled", () => {
  test("WHEN a request without a Bearer token carries an allowed certificate THEN it is the service caller and adopts the forwarded audit context", async () => {
    const response = await get({ ...machineHeaders, "x-triggered-by-user-id": triggeredBySubject });
    expect(response.status).toBe(200);
    expect((await response.json()) as WhoAmI).toMatchObject({
      user: { sub: machineSubject, role: "service" },
      audit: { actorUserId: machineSubject, triggeredByUserId: triggeredBySubject },
    });
  });

  test("WHEN a request carries neither a Bearer token nor a certificate THEN it is rejected", async () => {
    expect((await get({})).status).toBe(401);
  });

  test("WHEN the certificate's identity is not on the allowlist THEN it is rejected", async () => {
    const response = await get({
      "x-forwarded-client-cert": "URI=spiffe://cluster.local/ns/other/sa/caller",
    });
    expect(response.status).toBe(401);
  });
});
