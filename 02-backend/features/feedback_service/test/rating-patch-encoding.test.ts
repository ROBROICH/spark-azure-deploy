import { describe, expect, test } from "bun:test";
import { bindNodeRuntime, executeNodeMutation } from "@spark-workflow/node-crud";
import { Result } from "better-result";
import { drizzle } from "drizzle-orm/pg-proxy";

import { feedbackSchema } from "../src/db/schema";
import { feedbackDescriptor } from "../src/node";

// #306: changing a stored rating sends `{ rating: "negative" }` as an update.
// node-crud applies updates via jsonb_populate_record(null::feedback, ...), which bypasses the
// Drizzle customType toDriver. PostgreSQL then rejects the lowercase value for the
// feedbackrating enum (POSITIVE, NEGATIVE) and the route answers 500.
describe("feedback rating patch encoding (#306)", () => {
  test("encodes a changed rating as the uppercase feedbackrating enum label", async () => {
    const statements: { sql: string; params: unknown[] }[] = [];
    const database = drizzle(
      async (sql, params) => {
        statements.push({ sql, params });
        throw new Error("captured");
      },
      { schema: feedbackSchema },
    );
    const runtime = bindNodeRuntime(feedbackDescriptor, {
      persistence: {
        query: async (callback) => callback(database as never),
        streamRows: () => {
          throw new Error("unused");
        },
        transact: async (callback) => callback(),
      },
      versionPeer: {
        resolveLatestVersion: async () => Result.ok(1),
        validateWriteVersion: async () => Result.ok(undefined),
        validateVersionLock: async () => Result.ok(undefined),
      },
    });

    await executeNodeMutation(
      runtime,
      { user: { sub: "00000000-0000-4000-8000-000000000001" } } as never,
      "00000000-0000-4000-8000-000000000002",
      1,
      {
        updates: [
          {
            nodeType: "feedback",
            id: "00000000-0000-4000-8000-000000000003",
            payload: { rating: "negative" },
          },
        ],
      },
    ).catch(() => undefined);

    const update = statements.find(({ sql }) => sql.startsWith("update"));
    expect(update).toBeDefined();
    const json = update!.params.map(String).find((param) => param.startsWith("[{"));
    const encoded = JSON.parse(String(json)) as { rating: string }[];
    expect(encoded[0]?.rating).toBe("NEGATIVE");
  });
});
