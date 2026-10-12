import { describe, expect, test } from "bun:test";
import { SQL } from "bun";
import { DrizzleQueryError } from "drizzle-orm";
import { createError } from "evlog";

import { persistenceError, postgresErrors } from "../src";

const insert = 'insert into "project" ("name") values ($1)';
const privateValue = "PRIVATE_VALUE violates unique constraint";

function driverError(errno: string): DrizzleQueryError {
  return new DrizzleQueryError(
    insert,
    [privateValue],
    new SQL.PostgresError("write rejected", {
      code: "ERR_POSTGRES_SERVER_ERROR",
      errno,
      constraint: "project_key",
      detail: `Rejected value: ${privateValue}`,
    }),
  );
}

describe("PostgreSQL persistence errors", () => {
  test.each(["21000", "23503", "23505", "23P01"])("maps SQLSTATE %s to a constraint conflict", (errno) => {
    const error = persistenceError(driverError(errno));
    expect(error.code).toBe(postgresErrors.CONSTRAINT_CONFLICT.code);
    expect(error.status).toBe(409);
    expect(error.internal).toEqual({ code: errno, constraint: "project_key" });
  });

  test.each(["23502", "23514", "40001", "57P01"])(
    "maps SQLSTATE %s to an operation failure",
    (errno) => {
      const error = persistenceError(driverError(errno));
      expect(error.code).toBe(postgresErrors.OPERATION_FAILED.code);
      expect(error.status).toBe(500);
    },
  );

  test("never classifies by message text or bind parameters", () => {
    for (const cause of [
      new DrizzleQueryError(
        insert,
        [privateValue],
        new SQL.PostgresError("connection closed", { code: "ERR_POSTGRES_CONNECTION_CLOSED" }),
      ),
      new Error('value violates unique constraint "private"'),
    ]) {
      expect(persistenceError(cause).code).toBe(postgresErrors.OPERATION_FAILED.code);
    }
  });

  test("returns a domain error from the cause chain unchanged", () => {
    const domainError = createError({ status: 404, message: "Missing" });
    expect(persistenceError(domainError)).toBe(domainError);
    expect(persistenceError(new DrizzleQueryError(insert, [privateValue], domainError))).toBe(
      domainError,
    );
  });

  test("stops on a cyclic cause chain", () => {
    const first = new Error("first");
    const second = new Error("second", { cause: first });
    Object.defineProperty(first, "cause", { value: second });
    expect(persistenceError(first).code).toBe(postgresErrors.OPERATION_FAILED.code);
  });
});
