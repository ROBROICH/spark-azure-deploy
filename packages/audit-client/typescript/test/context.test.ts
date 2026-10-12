import { describe, expect, test } from "bun:test";

import {
  adoptForwardedAuditContext,
  currentAuditContext,
  setAuditActor,
  withAuditContext,
  type AuditContext,
} from "@spark-workflow/audit-client";
import fixture from "../../fixtures/audit-context-vectors.json";

const headerFields = {
  "X-Actor-User-Id": "actorUserId",
  "X-Triggered-By-User-Id": "triggeredByUserId",
  "X-Workflow-Run-Id": "workflowRunId",
  "X-Workflow-Type": "workflowType",
  "X-Request-Starttime": "requestStartTime",
  "X-Request-Id": "requestId",
} as const;

function forwardedHeaders(headers: Readonly<Record<string, string | undefined>>): Headers {
  return new Headers(
    Object.entries(headers).flatMap(([name, value]) => (value === undefined ? [] : [[name, value]])),
  );
}

function expectedContext(headers: Readonly<Record<string, string | undefined>>): AuditContext {
  return Object.fromEntries(
    Object.entries(headerFields).flatMap(([header, field]) =>
      headers[header] === undefined ? [] : [[field, headers[header]]],
    ),
  );
}

describe("audit request context", () => {
  for (const vector of [...fixture.validHeaders, ...fixture.malformedHeaders]) {
    test(vector.name, () => {
      const context = withAuditContext({}, () => {
        adoptForwardedAuditContext(forwardedHeaders(vector.headers));
        return currentAuditContext();
      });
      expect(context).toEqual(expectedContext(vector.expected));
    });
  }

  test("the authenticated actor replaces a forwarded actor of adopted machine provenance", () => {
    const actorUserId = fixture.identity.sub;
    const context = withAuditContext({}, () => {
      adoptForwardedAuditContext(forwardedHeaders(fixture.precedence.forwarded));
      setAuditActor(actorUserId);
      return currentAuditContext();
    });

    expect(context).toMatchObject({
      actorUserId,
      requestId: fixture.precedence.forwarded["X-Request-Id"],
      triggeredByUserId: fixture.precedence.forwarded["X-Triggered-By-User-Id"],
    });
  });

  test("a request that adopts nothing keeps only its local provenance", () => {
    const local = {
      requestId: "77777777-7777-4777-8777-777777777777",
      requestStartTime: "2026-10-07T00:00:00.000Z",
    };
    const context = withAuditContext(local, () => {
      setAuditActor(fixture.identity.sub);
      return currentAuditContext();
    });

    expect(context).toEqual({ ...local, actorUserId: fixture.identity.sub });
  });

  test("adopted machine provenance keeps the local request ID for malformed values", () => {
    const local = {
      requestId: "77777777-7777-4777-8777-777777777777",
      requestStartTime: "2026-10-07T00:00:00.000Z",
    };
    const context = withAuditContext(local, () => {
      adoptForwardedAuditContext(
        new Headers({ ...fixture.precedence.forwarded, "X-Request-Id": "not-a-uuid" }),
      );
      return currentAuditContext();
    });

    expect(context).toMatchObject({
      requestId: local.requestId,
      triggeredByUserId: fixture.precedence.forwarded["X-Triggered-By-User-Id"],
    });
  });

  test("an absent actor clears the actor of the current context", () => {
    const context = withAuditContext({ actorUserId: fixture.identity.sub }, () => {
      setAuditActor(undefined);
      return currentAuditContext();
    });

    expect(context.actorUserId).toBeUndefined();
  });

  test("parallel operations do not share context", async () => {
    const first = "11111111-1111-4111-8111-111111111111";
    const second = "22222222-2222-4222-8222-222222222222";
    let release!: () => void;
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    let arrivals = 0;
    const observe = (actor: string) =>
      withAuditContext({ actorUserId: actor }, async () => {
        arrivals += 1;
        if (arrivals === 2) release();
        await barrier;
        return currentAuditContext();
      });

    expect(await Promise.all([observe(first), observe(second)])).toEqual([
      { actorUserId: first },
      { actorUserId: second },
    ]);
    expect(currentAuditContext()).toEqual({});
  });

  test("an isolated Temporal context restores its caller", async () => {
    const outer = { workflowRunId: "outer" };
    const inner = { workflowRunId: "inner" };
    await withAuditContext(outer, async () => {
      let failure: unknown;
      try {
        await withAuditContext(inner, async () => {
          await Promise.resolve();
          expect(currentAuditContext()).toEqual(inner);
          throw new Error("failure");
        });
      } catch (error) {
        failure = error;
      }
      expect(failure).toHaveProperty("message", "failure");
      expect(currentAuditContext()).toEqual(outer);
    });
    expect(currentAuditContext()).toEqual({});
  });
});
