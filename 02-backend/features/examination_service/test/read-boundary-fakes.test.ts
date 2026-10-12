import { describe, expect, test } from "bun:test";

import fixture from "../fixtures/read-scenarios.json";
import {
  assertLawDatabaseReadFixtureComplete,
  createLawDatabaseReadFixture,
  lawDatabaseRequestKey,
} from "../scripts/read-boundary-fakes.ts";

const request = (path: string, init?: RequestInit) =>
  new Request(`http://fixture.invalid${path}`, init);

describe("strict Examination read boundary fixtures", () => {
  test("serves and exhausts every complete-input Law Database budget", async () => {
    const boundary = createLawDatabaseReadFixture();
    expect(boundary.requestKeys()).toHaveLength(fixture.lawDatabaseBoundary.requests.length);

    for (const budget of fixture.lawDatabaseBoundary.requests) {
      const path = `${budget.path}${budget.query ? `?${budget.query}` : ""}`;
      const key = lawDatabaseRequestKey(budget);
      for (let call = 0; call < budget.expectedCallsPerRun; call += 1) {
        const response = boundary.respond(request(path));
        expect({ status: response.status, body: await response.json() }).toEqual(budget.outcome);
      }
      expect(boundary.callsForRequest(key)).toBe(budget.expectedCallsPerRun);
    }

    expect(boundary.status()).toEqual({ complete: true, missing: [], unexpected: [] });
    expect(() => assertLawDatabaseReadFixtureComplete(boundary)).not.toThrow();
    expect(boundary.respond(request("/toc/")).status).toBe(500);
  });

  test("Law Database rejects changed method, query, path, and undeclared input", () => {
    const boundary = createLawDatabaseReadFixture();
    const responses = [
      boundary.respond(request("/toc/", { method: "POST" })),
      boundary.respond(request("/toc/?extra=1")),
      boundary.respond(request("/toc")),
      boundary.respond(request("/documents/UNKNOWN")),
    ];

    expect(responses.map(({ status }) => status)).toEqual([500, 500, 500, 500]);
    expect(boundary.status().unexpected).toHaveLength(4);
    expect(() => assertLawDatabaseReadFixtureComplete(boundary)).toThrow(
      "Examination Law Database boundary was not consumed exactly",
    );
  });
});
