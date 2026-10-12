import { describe, expect, test } from "bun:test";
import type { PostgresQueryClient, PostgresScope } from "@spark-workflow/postgres-runtime";
import { Result } from "better-result";
import { defineError } from "evlog";

import { formalCompletenessSchema } from "../src/db/schema.ts";
import { processFormalResults, processTocResults } from "../src/results.ts";

const PROJECT_ID = "10000000-0000-4000-8000-000000000001";
const FILE_ID = "20000000-0000-4000-8000-000000000001";
const RESULT_VERSION = 7;

const VersionLocked = defineError("formal-completeness-test.LOCKED", {
  status: 409,
  message: "Project version is locked",
});

const lockedWriter = (events: string[]) => ({
  async validateWriteVersion(projectId: string, projectVersion: number) {
    events.push(`validate:${projectId}:${projectVersion}`);
    return Result.err(VersionLocked());
  },
});

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

const persistenceTrap = (events: string[]) =>
  ({
    async transact<Value>(callback: () => Promise<Value>) {
      events.push("transaction");
      return callback();
    },
    async query<Value>(
      _callback: (
        database: PostgresQueryClient<typeof formalCompletenessSchema>,
      ) => Promise<Value>,
    ): Promise<Value> {
      events.push("query");
      throw new Error("persistence must not run after write validation fails");
    },
    streamRows: async function* () {
      yield* [];
    },
  }) satisfies PostgresScope<typeof formalCompletenessSchema>;

describe("Formal Completeness result transactions", () => {
  test("validates the result file version inside the formal-result write transaction", async () => {
    const events: string[] = [];
    const error = await processFormalResults(
      persistenceTrap(events),
      resultDocument(events, '{"matchedDocumentTypes":[],"unassignedDocuments":[]}'),
      lockedWriter(events),
      PROJECT_ID,
      undefined,
      FILE_ID,
    ).catch((cause) => cause);

    expect(error.code).toBe(VersionLocked.code);
    expect(events).toEqual([
      "document",
      "transaction",
      `validate:${PROJECT_ID}:${RESULT_VERSION}`,
    ]);
  });

  test("validates the result file version inside the empty-TOC write transaction", async () => {
    const events: string[] = [];
    const error = await processTocResults(
      persistenceTrap(events),
      resultDocument(
        events,
        '{"inhaltsverzeichnisExtractionOutput":{"status":"no_inhaltsverzeichnis_found"},"inhaltsverzeichnisMatchingOutput":{"matchedDocumentTypes":[]}}',
      ),
      lockedWriter(events),
      PROJECT_ID,
      undefined,
      FILE_ID,
    ).catch((cause) => cause);

    expect(error.code).toBe(VersionLocked.code);
    expect(events).toEqual([
      "document",
      "transaction",
      `validate:${PROJECT_ID}:${RESULT_VERSION}`,
    ]);
  });
});
