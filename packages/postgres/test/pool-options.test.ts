import { describe, expect, test } from "bun:test";

import {
  parsePostgresPoolOptions,
  type PostgresPoolEnvironment,
} from "../src";

const poolEnvironmentVariables = [
  "POSTGRES_POOL_MAX_CONNECTIONS",
  "POSTGRES_POOL_IDLE_TIMEOUT_SECONDS",
  "POSTGRES_POOL_CONNECTION_TIMEOUT_SECONDS",
  "POSTGRES_POOL_MAX_LIFETIME_SECONDS",
  "POSTGRES_POOL_CLOSE_TIMEOUT_SECONDS",
  "POSTGRES_POOL_READINESS_OBSERVATION_TIMEOUT_MILLISECONDS",
] as const;

const invalidValues = [
  ["empty", ""],
  ["whitespace", " "],
  ["zero", "0"],
  ["negative", "-1"],
  ["fractional", "1.5"],
  ["non-numeric", "many"],
  ["non-finite", "Infinity"],
  ["out-of-range", "9007199254740992"],
] as const;

describe("shared PostgreSQL pool options", () => {
  test("uses the accepted bounded defaults when variables are absent", () => {
    expect(parsePostgresPoolOptions({})).toEqual({
      maxConnections: 2,
      idleTimeoutSeconds: 30,
      connectionTimeoutSeconds: 10,
      maxLifetimeSeconds: 1_800,
      closeTimeoutSeconds: 10,
      readinessObservationTimeoutMilliseconds: 1_000,
    });
  });

  test("parses every supported override into one result", () => {
    expect(
      parsePostgresPoolOptions({
        POSTGRES_POOL_MAX_CONNECTIONS: "3",
        POSTGRES_POOL_IDLE_TIMEOUT_SECONDS: "31",
        POSTGRES_POOL_CONNECTION_TIMEOUT_SECONDS: "11",
        POSTGRES_POOL_MAX_LIFETIME_SECONDS: "1801",
        POSTGRES_POOL_CLOSE_TIMEOUT_SECONDS: "12",
        POSTGRES_POOL_READINESS_OBSERVATION_TIMEOUT_MILLISECONDS: "125",
      }),
    ).toEqual({
      maxConnections: 3,
      idleTimeoutSeconds: 31,
      connectionTimeoutSeconds: 11,
      maxLifetimeSeconds: 1_801,
      closeTimeoutSeconds: 12,
      readinessObservationTimeoutMilliseconds: 125,
    });
  });

  test("supports an explicit caller budget below a larger supervisor bound", () => {
    const supervisorTimeoutMilliseconds = 1_000;
    const options = parsePostgresPoolOptions({
      POSTGRES_POOL_READINESS_OBSERVATION_TIMEOUT_MILLISECONDS: "125",
    });

    expect(options.readinessObservationTimeoutMilliseconds).toBeLessThan(
      supervisorTimeoutMilliseconds,
    );
  });

  test("accepts the complete positive safe-integer millisecond range", () => {
    expect(
      parsePostgresPoolOptions({
        POSTGRES_POOL_READINESS_OBSERVATION_TIMEOUT_MILLISECONDS: String(
          Number.MAX_SAFE_INTEGER,
        ),
      }).readinessObservationTimeoutMilliseconds,
    ).toBe(Number.MAX_SAFE_INTEGER);
  });

  test("accepts the ordinary process environment composition seam", () => {
    const compileOnly = () => parsePostgresPoolOptions(process.env);
    expect(compileOnly).toBeFunction();
  });

  for (const variable of poolEnvironmentVariables) {
    test.each(invalidValues)(
      `rejects %s ${variable} values`,
      (_kind, value) => {
        const environment = { [variable]: value } as PostgresPoolEnvironment;
        expect(() => parsePostgresPoolOptions(environment)).toThrow(variable);
      },
    );
  }
});
