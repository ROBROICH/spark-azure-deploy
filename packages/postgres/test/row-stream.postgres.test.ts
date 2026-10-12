import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { createPostgresRuntime, type PostgresRuntime } from "../src";

const databaseUrl = process.env.POSTGRES_RUNTIME_TEST_URL;
const realPostgres = databaseUrl ? describe : describe.skip;

realPostgres("PostgreSQL row streaming", () => {
  let runtime: PostgresRuntime<{}>;

  beforeAll(() => {
    runtime = createPostgresRuntime({
      url: databaseUrl!,
      schema: {},
      pool: { closeTimeoutSeconds: 1, maxConnections: 1 },
    });
  });

  afterAll(() => runtime.close());

  test("fetches rows in bounded batches", async () => {
    const batches: number[][] = [];
    for await (const rows of runtime.streamRows<{ value: number }>(
      { sql: "select value from generate_series(1, 5) value order by value", params: [] },
      { batchSize: 2, signal: new AbortController().signal },
    )) {
      batches.push(rows.map(({ value }) => value));
    }

    expect(batches).toEqual([[1, 2], [3, 4], [5]]);
  });

  test("cancels active work, finishes the iterator, and releases the only connection", async () => {
    const abort = new AbortController();
    const iterator = runtime
      .streamRows(
        { sql: "select pg_sleep(10) from generate_series(1, 2)", params: [] },
        { batchSize: 2, signal: abort.signal },
      )
      [Symbol.asyncIterator]();
    const pending = iterator.next();
    await Bun.sleep(50);
    const startedAborting = performance.now();
    abort.abort();

    expect(await pending).toEqual({ value: undefined, done: true });
    expect(performance.now() - startedAborting).toBeLessThan(2_000);
    await runtime.ready();
  });
});
