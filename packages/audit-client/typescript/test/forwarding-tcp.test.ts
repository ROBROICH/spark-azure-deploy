import { afterEach, describe, expect, test } from "bun:test";
import { createServer, type Server } from "node:net";

import {
  adoptForwardedAuditContext,
  auditRequestInit,
  withAuditContext,
} from "@spark-workflow/audit-client";

const auditHeaderNames = new Set([
  "x-actor-user-id",
  "x-triggered-by-user-id",
  "x-workflow-run-id",
  "x-workflow-type",
  "x-request-starttime",
  "x-request-id",
]);
const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(
    servers
      .splice(0)
      .map(
        (server) =>
          new Promise<void>((resolve, reject) =>
            server.close((error) => (error ? reject(error) : resolve())),
          ),
      ),
  );
});

function withForwardedContext<Result>(
  headers: Readonly<Record<string, string>>,
  operation: () => Result,
): Result {
  return withAuditContext({}, () => {
    adoptForwardedAuditContext(new Headers(headers));
    return operation();
  });
}

async function captureRealFetch(init: RequestInit): Promise<Record<string, string>> {
  let resolveHeaders!: (headers: Record<string, string>) => void;
  const received = new Promise<Record<string, string>>((resolve) => {
    resolveHeaders = resolve;
  });
  const server = createServer((socket) => {
    let request = "";
    socket.on("data", (chunk) => {
      request += chunk.toString("ascii");
      if (!request.includes("\r\n\r\n")) return;
      const headers = Object.fromEntries(
        request
          .split("\r\n")
          .slice(1)
          .filter((line) => line.includes(":"))
          .map((line) => {
            const separator = line.indexOf(":");
            return [
              line.slice(0, separator).trim().toLowerCase(),
              line.slice(separator + 1).trim(),
            ];
          }),
      );
      resolveHeaders(headers);
      socket.end("HTTP/1.1 204 No Content\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
    });
  });
  servers.push(server);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- The Node TCP API returns a string or AddressInfo.
  if (address === null || typeof address === "string") throw new Error("missing TCP address");

  const response = await fetch(`http://127.0.0.1:${address.port}/capture`, init);
  expect(response.status).toBe(204);
  return received;
}

describe("canonical real HTTP forwarding", () => {
  test("strict TCP fake sees six values and a case-insensitive explicit override", async () => {
    const forwarded = {
      "X-Actor-User-Id": "11111111-1111-4111-8111-111111111111",
      "X-Triggered-By-User-Id": "22222222-2222-4222-8222-222222222222",
      "X-Workflow-Run-Id": "run-17",
      "X-Workflow-Type": "DocumentWorkflow",
      "X-Request-Starttime": "2026-07-16T10:00:00Z",
      "X-Request-Id": "33333333-3333-4333-8333-333333333333",
    };
    const override = "44444444-4444-4444-8444-444444444444";

    const received = await withForwardedContext(forwarded, () =>
      captureRealFetch(
        auditRequestInit({ headers: { "x-aCtOr-UsEr-Id": override, "X-Ordinary": "kept" } }),
      ),
    );
    const audit = Object.fromEntries(
      Object.entries(received).filter(([name]) => auditHeaderNames.has(name)),
    );
    expect(audit).toEqual({
      "x-actor-user-id": override,
      "x-triggered-by-user-id": "22222222-2222-4222-8222-222222222222",
      "x-workflow-run-id": "run-17",
      "x-workflow-type": "DocumentWorkflow",
      "x-request-starttime": "2026-07-16T10:00:00.000Z",
      "x-request-id": "33333333-3333-4333-8333-333333333333",
    });
    expect(received["x-ordinary"]).toBe("kept");
  });

  for (const [name, headers] of [
    ["absent", {}],
    [
      "invalid",
      {
        "X-Actor-User-Id": "not-a-uuid",
        "X-Request-Starttime": "not-a-time",
        "X-Request-Id": "not-a-uuid",
      },
    ],
  ] as const) {
    test(`${name} context emits no audit headers`, async () => {
      const received = await withForwardedContext(headers, () =>
        captureRealFetch(auditRequestInit()),
      );
      expect(Object.keys(received).filter((header) => auditHeaderNames.has(header))).toEqual([]);
    });
  }
});
