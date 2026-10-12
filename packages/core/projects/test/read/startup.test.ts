import { describe, expect } from "bun:test";

import { parseReadContract, ProbeSchema } from "../support/read-contracts.ts";
import { externalTest, readJson } from "../support/external-app.ts";

describe("Project Logic fixture-safe incumbent probes", () => {
  externalTest("reaches startup and host readiness through real TCP", async () => {
    const [startup, ready] = await Promise.all([readJson("/startup"), readJson("/ready")]);

    expect({
      startup: { status: startup.status, body: parseReadContract(ProbeSchema, startup.body) },
      ready: { status: ready.status, body: parseReadContract(ProbeSchema, ready.body) },
    }).toEqual({
      startup: { status: 200, body: { status: "ok" } },
      ready: { status: 200, body: { status: "ok" } },
    });
  });
});
