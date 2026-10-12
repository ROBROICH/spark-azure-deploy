import { describe, expect, test } from "bun:test";

import {
  PostgresReadinessUnavailableError,
  createPostgresRuntime,
  extractPostgresDriverErrorFacts,
  parsePostgresPoolOptions,
  type PostgresPoolOptions,
  type PostgresRuntime,
} from "../src";
import { qualificationSchema } from "./support/schema";

async function rejection(promise: PromiseLike<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (cause) {
    return cause;
  }
  throw new Error("Expected PostgreSQL operation to reject");
}

describe("public PostgreSQL runtime surface", () => {
  test("exports only the closed PostgreSQL driver-error fact extractor", () => {
    expect(
      extractPostgresDriverErrorFacts({
        sqlstate: "23505",
        message: "duplicate key",
        constraint: "project_name_key",
      }),
    ).toEqual({
      code: "23505",
      message: "duplicate key",
      constraint: "project_name_key",
    });
  });

  test("exports a typed readiness-unavailable error with stable reasons", () => {
    expect(new PostgresReadinessUnavailableError("database_unreachable")).toMatchObject({
      name: "PostgresReadinessUnavailableError",
      reason: "database_unreachable",
    });
    expect(new PostgresReadinessUnavailableError("response_deadline_exceeded")).toMatchObject({
      name: "PostgresReadinessUnavailableError",
      reason: "response_deadline_exceeded",
    });
  });

  test("accepts the five typed pool options", () => {
    const existingOptions: PostgresPoolOptions = {
      maxConnections: 2,
      idleTimeoutSeconds: 30,
      connectionTimeoutSeconds: 10,
      maxLifetimeSeconds: 1_800,
      closeTimeoutSeconds: 10,
    };
    const compileOnly = () =>
      createPostgresRuntime({
        url: "postgresql://qualification:qualification@127.0.0.1:1/qualification",
        schema: qualificationSchema,
        pool: existingOptions,
      });

    expect(compileOnly).toBeFunction();
  });

  test("types shared query and transaction operations", () => {
    const compileOnly = async (runtime: PostgresRuntime<typeof qualificationSchema>) => {
      const projects = await runtime.query((database) => database.query.projectTypes.findMany());
      return runtime.transact(async () => ({ schema: runtime.schema, projects }));
    };
    expect(compileOnly).toBeFunction();
  });

  test("keeps readiness reusable until explicit rollback closes the runtime", async () => {
    const runtime = createPostgresRuntime({
      url: "postgresql://qualification:qualification@127.0.0.1:1/qualification",
      schema: qualificationSchema,
      pool: parsePostgresPoolOptions({
        POSTGRES_POOL_MAX_CONNECTIONS: "1",
        POSTGRES_POOL_IDLE_TIMEOUT_SECONDS: "1",
        POSTGRES_POOL_CONNECTION_TIMEOUT_SECONDS: "1",
        POSTGRES_POOL_MAX_LIFETIME_SECONDS: "1",
        POSTGRES_POOL_CLOSE_TIMEOUT_SECONDS: "1",
      }),
    });
    expect(runtime.schema).toBe(qualificationSchema);

    try {
      const firstFailure = await runtime.ready().catch((cause: unknown) => cause);
      const secondFailure = await runtime.ready().catch((cause: unknown) => cause);
      expect(firstFailure).toMatchObject({
        name: "PostgresReadinessUnavailableError",
        reason: "database_unreachable",
      });
      expect(secondFailure).toMatchObject({
        name: "PostgresReadinessUnavailableError",
        reason: "database_unreachable",
      });
      expect(String(firstFailure)).not.toContain("PostgreSQL runtime is closed");
      expect(String(secondFailure)).not.toContain("PostgreSQL runtime is closed");

      const close = runtime.close();
      expect(runtime.close()).toBe(close);
      await close;

      expect(String(await rejection(runtime.ready()))).toContain("PostgreSQL runtime is closed");
      expect(() => runtime.query(async (database) => database.select())).toThrow(
        "PostgreSQL runtime is closed",
      );
      expect(() => runtime.transact(async () => undefined)).toThrow("PostgreSQL runtime is closed");
    } finally {
      await runtime.close();
    }
  });
});
