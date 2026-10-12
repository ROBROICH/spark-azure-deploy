import { afterAll } from "bun:test";

import {
  assertLawDatabaseReadFixtureComplete,
  createLawDatabaseReadFixture,
  EXAMINATION_LAW_DATABASE_FAKE_PORT,
  type LawDatabaseReadFixture,
} from "../../scripts/read-boundary-fakes.ts";

let lawDatabaseBoundary: LawDatabaseReadFixture | undefined;

if (process.env.EXAMINATION_BASE_URL !== undefined) {
  const boundary = createLawDatabaseReadFixture();
  lawDatabaseBoundary = boundary;
  const lawDatabaseServer = Bun.serve({
    hostname: "127.0.0.1",
    port: EXAMINATION_LAW_DATABASE_FAKE_PORT,
    fetch: (request) => boundary.respond(request),
  });

  afterAll(async () => {
    await lawDatabaseServer.stop(true);
    assertLawDatabaseReadFixtureComplete(boundary);
    console.log("Examination law-database boundary consumed all exact suite-owned calls");
  });
}

export function lawDatabaseReadRequestKeys(): string[] {
  if (lawDatabaseBoundary === undefined) {
    throw new Error("Examination Law Database suite boundary is not active");
  }
  return lawDatabaseBoundary.requestKeys();
}

export function lawDatabaseReadCallCount(key: string): number {
  if (lawDatabaseBoundary === undefined) {
    throw new Error("Examination Law Database suite boundary is not active");
  }
  return lawDatabaseBoundary.callsForRequest(key);
}
