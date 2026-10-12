import { afterAll, describe, expect, mock, test } from "bun:test";
import { currentAuditContext } from "@spark-workflow/audit-client";
import { authentication } from "@spark-workflow/authentification";
import {
  machineHeaders,
  machineSubject,
  useStrictAuthentication,
} from "@spark-workflow/test-support/strict-auth";
import { Elysia } from "elysia";

import { createHostTelemetry } from "../src/telemetry";

const { userToken, stop } = await useStrictAuthentication([]);
process.env.AUTH_ALLOWED_MACHINE_IDENTITIES = "spiffe://cluster.local/ns/test/sa/caller";
afterAll(() => {
  stop();
  mock.restore();
});

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const subject = "11111111-1111-4111-8111-111111111111";
const forged = {
  "x-actor-user-id": "22222222-2222-4222-8222-222222222222",
  "x-triggered-by-user-id": "33333333-3333-4333-8333-333333333333",
  "x-workflow-run-id": "asserted-run",
  "x-workflow-type": "asserted-workflow",
  "x-request-starttime": "2001-01-01T00:00:00Z",
  "x-request-id": "44444444-4444-4444-8444-444444444444",
};
const app = new Elysia()
  .use(createHostTelemetry("audit-provenance-test"))
  .use(authentication)
  .get("/audit", () => currentAuditContext());

const auditContext = (headers: Readonly<Record<string, string>>) =>
  app.handle(new Request("http://localhost/audit", { headers }));

describe("authenticated HTTP audit provenance", () => {
  for (const roles of [["user"], ["service"]]) {
    test(`discards forwarded provenance for a verified human with ${roles[0]} role`, async () => {
      const response = await auditContext({
        ...forged,
        ...machineHeaders,
        ...(await userToken(subject, roles)),
      });
      expect(response.status).toBe(200);
      const body = await response.text();
      expect(JSON.parse(body)).toEqual({
        actorUserId: subject,
        requestId: expect.stringMatching(uuidPattern),
        requestStartTime: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      });
      expect(body).not.toContain(forged["x-request-id"]);
      expect(body).not.toContain("2001-01-01");
    });
  }

  test("preserves workflow correlation only for an admitted machine identity", async () => {
    const response = await auditContext({ ...forged, ...machineHeaders });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      actorUserId: machineSubject,
      triggeredByUserId: forged["x-triggered-by-user-id"],
      workflowRunId: "asserted-run",
      workflowType: "asserted-workflow",
      requestStartTime: "2001-01-01T00:00:00.000Z",
      requestId: forged["x-request-id"],
    });

    const malformed = await auditContext({
      ...forged,
      ...machineHeaders,
      "x-request-id": "not-a-uuid",
    });
    expect(malformed.status).toBe(200);
    expect(await malformed.json()).toMatchObject({
      requestId: expect.stringMatching(uuidPattern),
    });
  });

  test("rejects provenance from a machine outside the configured allowlist", async () => {
    const response = await auditContext({
      ...forged,
      "x-forwarded-client-cert": "URI=spiffe://cluster.local/ns/test/sa/unlisted",
    });
    expect(response.status).toBe(401);
  });

  test("rejects invalid subjects and bearer credentials before a forwarded machine identity", async () => {
    for (const headers of [
      await userToken("not-a-uuid", ["user"]),
      { authorization: "Bearer invalid" },
    ]) {
      const response = await auditContext({ ...forged, ...machineHeaders, ...headers });
      expect(response.status).toBe(401);
    }
  });
});
