import { defineErrorCatalog, EvlogError } from "evlog";

import { extractPostgresDriverErrorFacts } from "./driver-error-facts";

export const postgresErrors = defineErrorCatalog("postgres", {
  CONSTRAINT_CONFLICT: {
    status: 409,
    message: "The change conflicts with existing data",
    why: "A constraint rejected the write or one upsert targeted the same row twice",
    fix: "Refresh the data and retry",
  },
  OPERATION_FAILED: {
    status: 500,
    message: "Database operation failed",
    why: "PostgreSQL could not complete the operation",
    fix: "Retry after the database is available",
  },
});

const constraintConflictCodes: ReadonlySet<string> = new Set(["21000", "23503", "23505", "23P01"]);

export function persistenceError(cause: unknown): EvlogError {
  const visited = new Set<Error>();
  for (
    let candidate = cause;
    candidate instanceof Error && !visited.has(candidate);
    candidate = candidate.cause
  ) {
    if (EvlogError.isEvlogError(candidate)) return candidate;
    visited.add(candidate);
  }
  const { code, constraint } = extractPostgresDriverErrorFacts(cause);
  const error = cause instanceof Error ? cause : undefined;
  return code !== undefined && constraintConflictCodes.has(code)
    ? postgresErrors.CONSTRAINT_CONFLICT({ cause: error, internal: { code, constraint } })
    : postgresErrors.OPERATION_FAILED({ cause: error, internal: { code } });
}
