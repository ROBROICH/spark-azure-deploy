import { expect, test } from "bun:test";

import { createPostgresRuntime } from "../src";

test("releases a paused row stream when its signal aborts", async () => {
  let closes = 0;
  let releases = 0;
  const reserved = {
    unsafe(statement: string) {
      return Promise.resolve(statement.startsWith("FETCH") ? [{ value: 1 }] : []);
    },
    close() {
      closes += 1;
      return Promise.resolve();
    },
    release() {
      releases += 1;
    },
  };
  const runtime = createPostgresRuntime({
    client: { reserve: async () => reserved } as never,
    closeClient: false,
    schema: {},
  });
  const abort = new AbortController();
  const iterator = runtime
    .streamRows<{ value: number }>(
      { sql: "select 1", params: [] },
      { batchSize: 1, signal: abort.signal },
    )
    [Symbol.asyncIterator]();

  expect(await iterator.next()).toEqual({ value: [{ value: 1 }], done: false });
  abort.abort();
  await Bun.sleep(0);

  expect({ closes, releases }).toEqual({ closes: 1, releases: 1 });
  await iterator.return?.();
  expect({ closes, releases }).toEqual({ closes: 1, releases: 1 });
  await runtime.close();
});

test("finishes an in-flight row stream when its signal aborts", async () => {
  let releases = 0;
  const fetchStarted = Promise.withResolvers<void>();
  const fetch = Promise.withResolvers<never>();
  const reserved = {
    unsafe(statement: string) {
      if (statement.startsWith("FETCH")) {
        fetchStarted.resolve();
        return fetch.promise;
      }
      return Promise.resolve([]);
    },
    close() {
      fetch.reject(new Error("Connection closed"));
      return Promise.resolve();
    },
    release() {
      releases += 1;
    },
  };
  const runtime = createPostgresRuntime({
    client: { reserve: async () => reserved } as never,
    closeClient: false,
    schema: {},
  });
  const abort = new AbortController();
  const iterator = runtime
    .streamRows<{ value: number }>(
      { sql: "select 1", params: [] },
      { batchSize: 1, signal: abort.signal },
    )
    [Symbol.asyncIterator]();

  const next = iterator.next();
  await fetchStarted.promise;
  abort.abort();

  expect(await next).toEqual({ value: undefined, done: true });
  expect(releases).toBe(1);
  await runtime.close();
});
