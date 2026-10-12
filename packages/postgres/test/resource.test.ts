import { expect, mock, test } from "bun:test";
import { runProcess } from "@spark-workflow/test-support";
import { Redacted } from "effect";

import type { PostgresSchema } from "../src/index.ts";
import { projectTypes, projects } from "./support/schema.ts";

const CHILD_ARGUMENT = "--postgres-resource-probe";

async function postgresResourceProbe() {
  const builder = (): object => {
    let value: object;
    value = Object.assign(Promise.resolve([{ oid: 1 }]), {
      from: () => value,
      limit: () => value,
    });
    return value;
  };
  interface FakeDatabase {
    readonly label: string;
    select(): object;
    transaction<Result>(callback: (client: FakeDatabase) => Promise<Result>): Promise<Result>;
  }
  const database: FakeDatabase = {
    label: "aggregate",
    select: builder,
    transaction: async <Result>(callback: (client: FakeDatabase) => Promise<Result>) =>
      callback(database),
  };
  await mock.module("drizzle-orm/bun-sql", () => ({ drizzle: () => database }));

  const { providePostgreSQL } = await import("../src/index.ts");
  const aggregateSchema = { projectTypes };
  const provider = providePostgreSQL({
    url: Redacted.make("postgresql://qualification:qualification@127.0.0.1:1/qualification"),
    schema: aggregateSchema,
    pool: {
      maxConnections: 1,
      idleTimeoutSeconds: 1,
      connectionTimeoutSeconds: 1,
      maxLifetimeSeconds: 1,
      closeTimeoutSeconds: 1,
    },
  });
  const service = await provider.make({});
  const scope = service.scope(aggregateSchema);
  const label = await scope.query(async (client) => Reflect.get(client, "label"));
  const errors: string[] = [];

  const captureScopeError = (schema: PostgresSchema): void => {
    try {
      service.scope(schema);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  };
  captureScopeError({ projects });
  captureScopeError({ projectTypes: projects });

  await provider.release?.(service);
  try {
    await scope.query(async () => undefined);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }

  return { errors, label };
}

if (Bun.argv.includes(CHILD_ARGUMENT)) {
  console.log(JSON.stringify(await postgresResourceProbe()));
} else {
  test("acquires one scoped PostgreSQL service and closes it on release", async () => {
    const { exitCode, stdout, stderr } = await runProcess([import.meta.path, CHILD_ARGUMENT]);

    expect(exitCode).toBe(0);
    expect(stderr).toBe("");
    expect(JSON.parse(stdout)).toEqual({
      errors: [
        "PostgreSQL runtime does not contain schema key 'projects'",
        "PostgreSQL runtime schema value for 'projectTypes' does not match",
        "PostgreSQL runtime is closed",
      ],
      label: "aggregate",
    });
  });
}
