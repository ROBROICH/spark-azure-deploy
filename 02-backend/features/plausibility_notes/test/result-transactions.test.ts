import { describe, expect, test } from "bun:test";
import { dmsErrors } from "@spark-workflow/core/documents/data";
import type { PostgresQueryClient, PostgresScope } from "@spark-workflow/postgres-runtime";
import { Result } from "better-result";
import { defineError } from "evlog";

import { plausibilitySchema } from "../src/db/schema.ts";
import { processPlausibilityResults } from "../src/results.ts";

const PROJECT_ID = "10000000-0000-4000-8000-000000000001";
const FILE_ID = "20000000-0000-4000-8000-000000000001";
const RESULT_VERSION = 7;
const ProjectConflict = defineError("project-logic.CONFLICT", {
  status: 409,
  message: "Project state conflict",
});

const persistenceTrap = (events: string[]) =>
  ({
    async transact<Value>(callback: () => Promise<Value>) {
      events.push("transaction");
      return callback();
    },
    async query<Value>(
      _callback: (database: PostgresQueryClient<typeof plausibilitySchema>) => Promise<Value>,
    ): Promise<Value> {
      events.push("query");
      throw new Error("persistence must not run after write validation fails");
    },
    streamRows: async function* () {
      yield* [];
    },
  }) satisfies PostgresScope<typeof plausibilitySchema>;

const resultDocument = (events: string[], payload: string) => ({
  async readResultFile() {
    events.push("document");
    return {
      projectId: PROJECT_ID,
      projectVersion: RESULT_VERSION,
      bytes: new TextEncoder().encode(payload),
    };
  },
});

const conflictingWriter = (events: string[]) => ({
  async validateWriteVersion(projectId: string, projectVersion: number) {
    events.push(`validate:${projectId}:${projectVersion}`);
    return Result.err(ProjectConflict());
  },
});

describe("Plausibility result transactions", () => {
  test("rejects a result file outside the plausibility contract before writing", async () => {
    const events: string[] = [];

    const error = await processPlausibilityResults(
      persistenceTrap(events),
      resultDocument(events, '{"contradictions":"invalid"}'),
      conflictingWriter(events),
      PROJECT_ID,
      FILE_ID,
      undefined,
    ).catch((cause) => cause);

    expect(error).toMatchObject({ code: dmsErrors.INVALID_REQUEST.code, status: 422 });
    expect(events).toEqual(["document"]);
  });
});
