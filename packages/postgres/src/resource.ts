import { provide } from "@spark-workflow/resource";
import { Redacted } from "effect";

import {
  createPostgresRuntime,
  parsePostgresPoolOptions,
  type PostgresPoolOptions,
  type PostgresResourceRuntime,
  type PostgresSchema,
  type PostgreSQLService,
} from "./runtime";
import { PostgreSQL } from "./postgresql";

export { PostgreSQL } from "./postgresql";

export interface PostgreSQLProviderOptions<TSchema extends PostgresSchema> {
  readonly url: Redacted.Redacted<string>;
  readonly schema: TSchema;
  readonly pool?: Partial<PostgresPoolOptions>;
}

export function providePostgreSQL<const TSchema extends PostgresSchema>(
  options: PostgreSQLProviderOptions<TSchema>,
) {
  const runtimes = new WeakMap<PostgreSQLService, PostgresResourceRuntime<TSchema>>();

  return provide({
    resource: PostgreSQL,
    needs: {},
    async make() {
      const runtime = createPostgresRuntime({
        ...options,
        url: Redacted.value(options.url),
        pool: options.pool ?? parsePostgresPoolOptions(),
      });
      try {
        await runtime.ready();
      } catch (error) {
        try {
          await runtime.close();
        } catch (closeError) {
          throw new AggregateError([error, closeError], "Failed to acquire and close PostgreSQL");
        }
        throw error;
      }
      const service: PostgreSQLService = Object.freeze({
        scope: runtime.scope,
      });
      runtimes.set(service, runtime);
      return service;
    },
    release(service) {
      const runtime = runtimes.get(service);
      if (runtime === undefined) return;
      runtimes.delete(service);
      return runtime.close();
    },
  });
}
