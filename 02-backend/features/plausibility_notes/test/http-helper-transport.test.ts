import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { readJson } from "./support/external-app.ts";
import { mutateJson } from "./support/mutation-http.ts";

describe("Plausibility external HTTP helper transport", () => {
  const requests: Array<{ connection: string | null; caller: string | null }> = [];
  const previousBaseUrl = process.env.PLAUSIBILITY_BASE_URL;
  let server: ReturnType<typeof Bun.serve>;

  beforeAll(() => {
    server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch(request) {
        requests.push({
          connection: request.headers.get("connection"),
          caller: request.headers.get("x-caller-header"),
        });
        return Response.json({ ok: true });
      },
    });
    process.env.PLAUSIBILITY_BASE_URL = server.url.toString();
  });

  afterAll(async () => {
    await server.stop(true);
    if (previousBaseUrl === undefined) {
      delete process.env.PLAUSIBILITY_BASE_URL;
    } else {
      process.env.PLAUSIBILITY_BASE_URL = previousBaseUrl;
    }
  });

  test("forces connection close while preserving each caller's headers", async () => {
    expect(await readJson("/read", { headers: { "x-caller-header": "read" } })).toEqual({
      status: 200,
      body: { ok: true },
    });
    expect(
      await mutateJson("/mutation", {
        method: "POST",
        headers: { "x-caller-header": "mutation" },
      }),
    ).toEqual({ status: 200, body: { ok: true } });

    expect(requests).toEqual([
      { connection: "close", caller: "read" },
      { connection: "close", caller: "mutation" },
    ]);
  });
});
