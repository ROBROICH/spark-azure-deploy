import { expect, mock, test } from "bun:test";
import { runProcess } from "@spark-workflow/test-support";

import { qualificationSchema } from "./support/schema";

const CHILD_ARGUMENT = "--transaction-context-probe";

async function transactionContextProbe() {
  const transaction = { label: "transaction" };
  let commits = 0;
  let rollbacks = 0;
  const database = {
    label: "base",
    transaction: async <Result>(
      callback: (client: typeof transaction) => Promise<Result>,
    ): Promise<Result> => {
      try {
        const result = await callback(transaction);
        commits += 1;
        return result;
      } catch (error) {
        rollbacks += 1;
        throw error;
      }
    },
  };
  await mock.module("drizzle-orm/bun-sql", () => ({
    drizzle: () => database,
  }));

  const { createPostgresRuntime } = await import("../src");
  const runtime = createPostgresRuntime({
    url: "postgresql://qualification:qualification@127.0.0.1:1/qualification",
    schema: qualificationSchema,
  });
  const clients: unknown[] = [];
  let nestedTransaction: unknown;
  let releaseDetached = (): void => undefined;
  const detachedGate = new Promise<void>((resolve) => {
    releaseDetached = resolve;
  });
  let detachedQuery: Promise<string> | undefined;
  let detachedTransaction: Promise<string> | undefined;
  let releaseUnawaited = (): void => undefined;
  const unawaitedGate = new Promise<void>((resolve) => {
    releaseUnawaited = resolve;
  });
  let unawaitedQuery: Promise<void> | undefined;
  let unawaitedTransaction: unknown;
  let releaseFailedUnawaited = (): void => undefined;
  const failedUnawaitedGate = new Promise<void>((resolve) => {
    releaseFailedUnawaited = resolve;
  });
  let failedUnawaitedQuery: Promise<void> | undefined;
  let failedUnawaitedTransaction: unknown;
  const attemptNestedTransaction = () => runtime.transact(async () => undefined);

  await runtime.query(async (client) => {
    clients.push(Reflect.get(client, "label"));
  });
  await runtime.transact(async () => {
    await runtime.query(async (client) => {
      clients.push(Reflect.get(client, "label"));
    });
    try {
      await attemptNestedTransaction();
    } catch (error) {
      nestedTransaction = error instanceof Error ? error.name : String(error);
    }
    detachedQuery = detachedGate.then(async () => {
      try {
        await runtime.query(async () => undefined);
        return "resolved";
      } catch (error) {
        return error instanceof Error ? error.name : String(error);
      }
    });
    detachedTransaction = detachedGate.then(async () => {
      try {
        await attemptNestedTransaction();
        return "resolved";
      } catch (error) {
        return error instanceof Error ? error.name : String(error);
      }
    });
  });
  const unfinishedTransaction = runtime.transact(async () => {
    unawaitedQuery = runtime.query(async () => {
      await unawaitedGate;
    });
  });
  await Promise.resolve();
  releaseUnawaited();
  try {
    await unfinishedTransaction;
  } catch (error) {
    unawaitedTransaction = error instanceof Error ? error.name : String(error);
  }
  await unawaitedQuery;
  const unfinishedFailedTransaction = runtime.transact(async () => {
    failedUnawaitedQuery = runtime.query(async () => {
      await failedUnawaitedGate;
    });
    throw new Error("outer callback failed");
  });
  await Promise.resolve();
  releaseFailedUnawaited();
  try {
    await unfinishedFailedTransaction;
  } catch (error) {
    failedUnawaitedTransaction = error instanceof Error ? error.message : String(error);
  }
  await failedUnawaitedQuery;
  releaseDetached();
  await runtime.query(async (client) => {
    clients.push(Reflect.get(client, "label"));
  });
  const detached = await Promise.all([detachedQuery, detachedTransaction]);
  await runtime.close();

  return {
    clients,
    detached,
    nestedTransaction,
    transactionOutcomes: { commits, rollbacks },
    failedUnawaitedTransaction,
    unawaitedTransaction,
  };
}

if (Bun.argv.includes(CHILD_ARGUMENT)) {
  console.log(JSON.stringify(await transactionContextProbe()));
} else {
  test("uses the ambient transaction client only inside transact", async () => {
    const { exitCode, stdout, stderr } = await runProcess([import.meta.path, CHILD_ARGUMENT]);

    expect(exitCode).toBe(0);
    expect(stderr).toBe("");
    expect(JSON.parse(stdout)).toEqual({
      clients: ["base", "transaction", "base"],
      detached: [
        "ExpiredPostgresTransactionContextError",
        "ExpiredPostgresTransactionContextError",
      ],
      nestedTransaction: "NestedPostgresTransactionError",
      transactionOutcomes: { commits: 1, rollbacks: 2 },
      failedUnawaitedTransaction: "outer callback failed",
      unawaitedTransaction: "UnawaitedPostgresQueryError",
    });
  });
}
