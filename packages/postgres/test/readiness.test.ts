import { expect, mock, test } from "bun:test";
import { runProcess } from "@spark-workflow/test-support";
import { qualificationSchema } from "./support/schema";

const CHILD_ARGUMENT = "--readiness-single-flight-probe";

type QueryBehavior = "failure" | "late-failure" | "late-success" | "success";
type ReadinessReason = "database_unreachable" | "response_deadline_exceeded";

interface ProbeResult {
  readonly name: string;
  readonly reason?: ReadinessReason;
}

interface FakeBuilder {
  from(): FakeBuilder;
  limit(): FakeBuilder;
  then(
    resolve: (value: { oid: number }[]) => unknown,
    reject: (cause: unknown) => unknown,
  ): Promise<unknown>;
}

interface FakeDatabase {
  $count(): FakeBuilder;
  delete(): FakeBuilder;
  insert(): FakeBuilder;
  readonly query: object;
  select(): FakeBuilder;
  selectDistinct(): FakeBuilder;
  selectDistinctOn(): FakeBuilder;
  transaction(callback: (transaction: FakeDatabase) => unknown): Promise<unknown>;
  update(): FakeBuilder;
}

function result(cause: unknown): ProbeResult {
  if (!(cause instanceof Error)) return { name: "non-error" };
  const reason = Reflect.get(cause, "reason", cause);
  if (reason === "database_unreachable" || reason === "response_deadline_exceeded") {
    return { name: cause.name, reason };
  }
  return { name: cause.name };
}

async function readinessProbe() {
  let behavior: QueryBehavior = "late-success";
  let executions = 0;
  const unhandled: string[] = [];
  const onUnhandled = (cause: unknown): void => {
    unhandled.push(result(cause).name);
  };
  process.on("unhandledRejection", onUnhandled);

  const query = (): Promise<{ oid: number }[]> => {
    executions += 1;
    const selectedBehavior = behavior;
    if (selectedBehavior === "success") return Promise.resolve([{ oid: 1 }]);
    if (selectedBehavior === "failure") return Promise.reject(new Error("database unavailable"));
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        if (selectedBehavior === "late-success") resolve([{ oid: 1 }]);
        else reject(new Error("late database failure"));
      }, 80);
    });
  };
  const builder = (): FakeBuilder => {
    let value: FakeBuilder;
    const source = Object.assign(Promise.resolve<{ oid: number }[]>([]), {
      from: () => value,
      limit: () => value,
    });
    value = new Proxy(source, {
      get(target, property, receiver) {
        if (property === "then") {
          return (
            resolve: (rows: { oid: number }[]) => unknown,
            reject: (cause: unknown) => unknown,
          ) => query().then(resolve, reject);
        }
        return Reflect.get(target, property, receiver);
      },
    });
    return value;
  };
  const database: FakeDatabase = {
    $count: builder,
    delete: builder,
    insert: builder,
    query: {},
    select: builder,
    selectDistinct: builder,
    selectDistinctOn: builder,
    transaction: async (callback) => await callback(database),
    update: builder,
  };

  await mock.module("drizzle-orm/bun-sql", () => ({ drizzle: () => database }));
  const { createPostgresRuntime } = await import("../src");
  const runtime = createPostgresRuntime({
    url: "postgresql://qualification:qualification@127.0.0.1:1/qualification",
    schema: qualificationSchema,
    pool: {
      maxConnections: 2,
      idleTimeoutSeconds: 1,
      connectionTimeoutSeconds: 1,
      maxLifetimeSeconds: 1,
      closeTimeoutSeconds: 1,
      readinessObservationTimeoutMilliseconds: 20,
    },
  });
  const outcome = async (promise: Promise<void>): Promise<ProbeResult> => {
    try {
      await promise;
      return { name: "success" };
    } catch (error) {
      return result(error);
    }
  };

  try {
    const first = await Promise.all([
      outcome(runtime.ready()),
      outcome(runtime.ready()),
      outcome(runtime.ready()),
    ]);
    const whilePending = await outcome(runtime.ready());
    await Bun.sleep(70);

    behavior = "success";
    const afterLateSuccess = await outcome(runtime.ready());

    behavior = "late-failure";
    const lateFailure = await outcome(runtime.ready());
    await Bun.sleep(90);

    behavior = "success";
    const afterLateFailure = await outcome(runtime.ready());

    behavior = "failure";
    const databaseFailure = await outcome(runtime.ready());

    behavior = "success";
    const afterDatabaseFailure = await outcome(runtime.ready());
    await Bun.sleep(10);

    return {
      afterDatabaseFailure,
      afterLateFailure,
      afterLateSuccess,
      databaseFailure,
      executions,
      first,
      lateFailure,
      unhandled,
      whilePending,
    };
  } finally {
    process.off("unhandledRejection", onUnhandled);
    await runtime.close();
  }
}

if (Bun.argv.includes(CHILD_ARGUMENT)) {
  console.log(JSON.stringify(await readinessProbe()));
} else {
  test("shares one readiness flight and observes late success and failure safely", async () => {
    const { exitCode, stdout, stderr } = await runProcess([import.meta.path, CHILD_ARGUMENT]);

    expect(exitCode).toBe(0);
    expect(stderr).toBe("");
    expect(JSON.parse(stdout)).toEqual({
      afterDatabaseFailure: { name: "success" },
      afterLateFailure: { name: "success" },
      afterLateSuccess: { name: "success" },
      databaseFailure: {
        name: "PostgresReadinessUnavailableError",
        reason: "database_unreachable",
      },
      executions: 6,
      first: Array.from({ length: 3 }, () => ({
        name: "PostgresReadinessUnavailableError",
        reason: "response_deadline_exceeded",
      })),
      lateFailure: {
        name: "PostgresReadinessUnavailableError",
        reason: "response_deadline_exceeded",
      },
      unhandled: [],
      whilePending: {
        name: "PostgresReadinessUnavailableError",
        reason: "response_deadline_exceeded",
      },
    });
  }, 5_000);
}
