import { SQL } from "bun";
import { AsyncLocalStorage } from "node:async_hooks";
import { DrizzleQueryError, type Table } from "drizzle-orm";
import { drizzle, type BunSQLDatabase } from "drizzle-orm/bun-sql";
import { integer, pgSchema } from "drizzle-orm/pg-core";
import type { Relations } from "drizzle-orm/relations";

import { persistenceError } from "./persistence-error";

const pgCatalog = pgSchema("pg_catalog");
const pgTypes = pgCatalog.table("pg_type", {
  oid: integer("oid").notNull(),
});

const DEFAULT_POOL: ResolvedPostgresPoolOptions = {
  maxConnections: 2,
  idleTimeoutSeconds: 30,
  connectionTimeoutSeconds: 10,
  maxLifetimeSeconds: 1_800,
  closeTimeoutSeconds: 10,
  readinessObservationTimeoutMilliseconds: 1_000,
};

const POOL_ENVIRONMENT_VARIABLES = [
  ["POSTGRES_POOL_MAX_CONNECTIONS", "maxConnections"],
  ["POSTGRES_POOL_IDLE_TIMEOUT_SECONDS", "idleTimeoutSeconds"],
  ["POSTGRES_POOL_CONNECTION_TIMEOUT_SECONDS", "connectionTimeoutSeconds"],
  ["POSTGRES_POOL_MAX_LIFETIME_SECONDS", "maxLifetimeSeconds"],
  ["POSTGRES_POOL_CLOSE_TIMEOUT_SECONDS", "closeTimeoutSeconds"],
  [
    "POSTGRES_POOL_READINESS_OBSERVATION_TIMEOUT_MILLISECONDS",
    "readinessObservationTimeoutMilliseconds",
  ],
] satisfies ReadonlyArray<
  readonly [keyof PostgresPoolEnvironment, keyof PostgresPoolOptions]
>;

interface PostgresEnumDefinition {
  readonly enumName: string;
  readonly enumValues: readonly string[];
  readonly schema: string | undefined;
}

type PostgresSchemaValue = Table | Relations | PostgresEnumDefinition;

export type PostgresSchema = Record<string, PostgresSchemaValue>;

type CapabilityKeys =
  | "$count"
  | "delete"
  | "execute"
  | "insert"
  | "query"
  | "select"
  | "selectDistinct"
  | "selectDistinctOn"
  | "update";

export type PostgresQueryClient<TSchema extends PostgresSchema> = Pick<
  BunSQLDatabase<TSchema>,
  CapabilityKeys
>;

export interface PostgresPoolOptions {
  maxConnections: number;
  idleTimeoutSeconds: number;
  connectionTimeoutSeconds: number;
  maxLifetimeSeconds: number;
  closeTimeoutSeconds: number;
  readinessObservationTimeoutMilliseconds?: number;
}

export interface ResolvedPostgresPoolOptions extends PostgresPoolOptions {
  readinessObservationTimeoutMilliseconds: number;
}

export interface PostgresPoolEnvironment {
  readonly [name: string]: string | undefined;
  readonly POSTGRES_POOL_MAX_CONNECTIONS?: string;
  readonly POSTGRES_POOL_IDLE_TIMEOUT_SECONDS?: string;
  readonly POSTGRES_POOL_CONNECTION_TIMEOUT_SECONDS?: string;
  readonly POSTGRES_POOL_MAX_LIFETIME_SECONDS?: string;
  readonly POSTGRES_POOL_CLOSE_TIMEOUT_SECONDS?: string;
  readonly POSTGRES_POOL_READINESS_OBSERVATION_TIMEOUT_MILLISECONDS?: string;
}

export interface PostgresCompiledQuery {
  readonly sql: string;
  readonly params: readonly unknown[];
}

export interface PostgresRowStreamOptions {
  readonly batchSize: number;
  readonly signal: AbortSignal;
}

interface PostgresRuntimeOptions<TSchema extends PostgresSchema> {
  schema: TSchema;
  pool?: Partial<PostgresPoolOptions>;
}

export type CreatePostgresRuntimeOptions<TSchema extends PostgresSchema> =
  PostgresRuntimeOptions<TSchema> &
    (
      | Readonly<{ url: string; client?: never; closeClient?: never }>
      | Readonly<{ client: SQL; url?: never; closeClient?: boolean }>
    );

export interface PostgresScope<TSchema extends PostgresSchema> {
  query<TResult>(
    callback: (database: PostgresQueryClient<TSchema>) => Promise<TResult>,
  ): Promise<TResult>;
  streamRows<TResult>(
    statement: PostgresCompiledQuery,
    options: PostgresRowStreamOptions,
  ): AsyncIterable<readonly TResult[]>;
  transact<TResult>(callback: () => Promise<TResult>): Promise<TResult>;
}

export interface PostgreSQLService {
  scope<const TSchema extends PostgresSchema>(schema: TSchema): PostgresScope<TSchema>;
}

export interface PostgresRuntime<TSchema extends PostgresSchema> extends PostgresScope<TSchema> {
  readonly schema: TSchema;
  ready(): Promise<void>;
  close(): Promise<void>;
}

export interface PostgresResourceRuntime<TSchema extends PostgresSchema>
  extends PostgresRuntime<TSchema>, PostgreSQLService {}

export type PostgresReadinessUnavailableReason =
  | "database_unreachable"
  | "response_deadline_exceeded";

export class PostgresReadinessUnavailableError extends Error {
  readonly reason: PostgresReadinessUnavailableReason;

  constructor(reason: PostgresReadinessUnavailableReason, options?: ErrorOptions) {
    super(`PostgreSQL readiness is unavailable: ${reason}`, options);
    this.name = "PostgresReadinessUnavailableError";
    this.reason = reason;
  }
}

export class NestedPostgresTransactionError extends Error {
  constructor() {
    super("Nested PostgreSQL transactions are not allowed");
    this.name = "NestedPostgresTransactionError";
  }
}

export class ExpiredPostgresTransactionContextError extends Error {
  constructor() {
    super("PostgreSQL transaction context is no longer active");
    this.name = "ExpiredPostgresTransactionContextError";
  }
}

export class UnawaitedPostgresQueryError extends Error {
  constructor() {
    super("PostgreSQL transaction callback finished with active queries");
    this.name = "UnawaitedPostgresQueryError";
  }
}

export class PostgresRowStreamInTransactionError extends Error {
  constructor() {
    super("PostgreSQL row streams cannot run inside a transaction callback");
    this.name = "PostgresRowStreamInTransactionError";
  }
}

function positiveInteger(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`PostgreSQL pool option '${name}' must be a positive integer`);
  }
  return value;
}

function environmentPositiveInteger(value: string, name: string): number {
  if (!/^\d+$/.test(value)) {
    throw new TypeError(`PostgreSQL pool variable '${name}' must be a positive decimal integer`);
  }
  return positiveInteger(Number(value), name);
}

function poolOptions(
  options: Partial<PostgresPoolOptions> | undefined,
): ResolvedPostgresPoolOptions {
  const merged = { ...DEFAULT_POOL, ...options };
  return {
    maxConnections: positiveInteger(merged.maxConnections, "maxConnections"),
    idleTimeoutSeconds: positiveInteger(merged.idleTimeoutSeconds, "idleTimeoutSeconds"),
    connectionTimeoutSeconds: positiveInteger(
      merged.connectionTimeoutSeconds,
      "connectionTimeoutSeconds",
    ),
    maxLifetimeSeconds: positiveInteger(merged.maxLifetimeSeconds, "maxLifetimeSeconds"),
    closeTimeoutSeconds: positiveInteger(merged.closeTimeoutSeconds, "closeTimeoutSeconds"),
    readinessObservationTimeoutMilliseconds: positiveInteger(
      merged.readinessObservationTimeoutMilliseconds ??
        DEFAULT_POOL.readinessObservationTimeoutMilliseconds,
      "readinessObservationTimeoutMilliseconds",
    ),
  };
}

export function parsePostgresPoolOptions(
  environment: PostgresPoolEnvironment = process.env,
): ResolvedPostgresPoolOptions {
  const overrides: Partial<PostgresPoolOptions> = {};
  for (const [variable, option] of POOL_ENVIRONMENT_VARIABLES) {
    const value = environment[variable];
    if (value !== undefined) overrides[option] = environmentPositiveInteger(value, variable);
  }
  return poolOptions(overrides);
}

function assertPostgresUrl(value: string): void {
  let protocol: string;
  try {
    protocol = new URL(value).protocol;
  } catch {
    throw new TypeError("PostgreSQL runtime requires a valid connection URL");
  }
  if (protocol !== "postgres:" && protocol !== "postgresql:") {
    throw new TypeError("PostgreSQL runtime requires a PostgreSQL connection URL");
  }
}

function rejectDatabaseFailure(cause: unknown): never {
  throw cause instanceof DrizzleQueryError || cause instanceof SQL.SQLError
    ? persistenceError(cause)
    : cause;
}

const MAX_TIMER_DELAY_MILLISECONDS = 2_147_483_647;

function scheduleDeadline(timeoutMilliseconds: number, callback: () => void): () => void {
  const deadline = process.hrtime.bigint() + BigInt(timeoutMilliseconds) * 1_000_000n;
  let active = true;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const schedule = (): void => {
    if (!active) return;
    const remainingNanoseconds = deadline - process.hrtime.bigint();
    if (remainingNanoseconds <= 0n) {
      active = false;
      callback();
      return;
    }
    const remainingMilliseconds = Number((remainingNanoseconds + 999_999n) / 1_000_000n);
    timeout = setTimeout(schedule, Math.min(remainingMilliseconds, MAX_TIMER_DELAY_MILLISECONDS));
  };
  schedule();
  return () => {
    active = false;
    if (timeout !== undefined) clearTimeout(timeout);
  };
}

async function waitForReadiness(flight: Promise<void>, timeoutMilliseconds: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    let cancelDeadline = (): void => undefined;
    const settle = (callback: () => void): void => {
      if (settled) return;
      settled = true;
      cancelDeadline();
      callback();
    };

    cancelDeadline = scheduleDeadline(timeoutMilliseconds, () => {
      settle(() => reject(new PostgresReadinessUnavailableError("response_deadline_exceeded")));
    });
    void flight.then(
      () => settle(resolve),
      (cause: unknown) =>
        settle(() =>
          reject(new PostgresReadinessUnavailableError("database_unreachable", { cause })),
        ),
    );
  });
}

export function createPostgresRuntime<TSchema extends PostgresSchema>(
  options: CreatePostgresRuntimeOptions<TSchema>,
): PostgresResourceRuntime<TSchema> {
  const pool = poolOptions(options.pool);
  if (options.url !== undefined) assertPostgresUrl(options.url);
  const ownsClient = options.client === undefined || options.closeClient === true;
  const client =
    options.client ??
    new SQL(options.url, {
      prepare: false,
      max: pool.maxConnections,
      idleTimeout: pool.idleTimeoutSeconds,
      connectionTimeout: pool.connectionTimeoutSeconds,
      maxLifetime: pool.maxLifetimeSeconds,
    });
  const database = drizzle({
    client,
    schema: options.schema,
  });
  let closed = false;
  let closePromise: Promise<void> | undefined;
  let readinessFlight: Promise<void> | undefined;
  const transactions = new AsyncLocalStorage<{
    active: boolean;
    readonly client: PostgresQueryClient<TSchema>;
    readonly queries: Set<Promise<unknown>>;
  }>();

  const assertOpen = (): void => {
    if (closed) throw new Error("PostgreSQL runtime is closed");
  };
  const close = (): Promise<void> => {
    if (!closePromise) {
      closed = true;
      closePromise = ownsClient
        ? client.close({ timeout: pool.closeTimeoutSeconds })
        : Promise.resolve();
    }
    return closePromise;
  };
  const startReadinessFlight = (): Promise<void> => {
    const flight = (async () => {
      await database.select({ oid: pgTypes.oid }).from(pgTypes).limit(1);
    })();
    readinessFlight = flight;
    void flight.then(
      () => {
        if (readinessFlight === flight) readinessFlight = undefined;
      },
      () => {
        if (readinessFlight === flight) readinessFlight = undefined;
      },
    );
    return flight;
  };
  const ready = async (): Promise<void> => {
    assertOpen();
    const flight = readinessFlight ?? startReadinessFlight();
    await waitForReadiness(flight, pool.readinessObservationTimeoutMilliseconds);
  };

  const query = <TResult>(
    callback: (database: PostgresQueryClient<TSchema>) => Promise<TResult>,
  ): Promise<TResult> => {
    assertOpen();
    const transaction = transactions.getStore();
    if (transaction !== undefined && !transaction.active) {
      throw new ExpiredPostgresTransactionContextError();
    }
    if (transaction === undefined) return callback(database).catch(rejectDatabaseFailure);
    try {
      let tracked: Promise<TResult>;
      tracked = callback(transaction.client).catch(rejectDatabaseFailure).finally(() => {
        transaction.queries.delete(tracked);
      });
      transaction.queries.add(tracked);
      return tracked;
    } catch (error) {
      return Promise.reject(error);
    }
  };

  const transact = <TResult>(callback: () => Promise<TResult>): Promise<TResult> => {
    assertOpen();
    const current = transactions.getStore();
    if (current !== undefined && !current.active) {
      throw new ExpiredPostgresTransactionContextError();
    }
    if (current !== undefined) {
      throw new NestedPostgresTransactionError();
    }
    // A queued transaction can arrive in the previous borrower's async context.
    return database.transaction(AsyncLocalStorage.bind(async (client: PostgresQueryClient<TSchema>) => {
      const transaction = { active: true, client, queries: new Set<Promise<unknown>>() };
      let callbackFailed = false;
      let callbackError: unknown;
      let result: TResult | undefined;
      try {
        result = await transactions.run(transaction, callback);
      } catch (error) {
        callbackFailed = true;
        callbackError = error;
      } finally {
        transaction.active = false;
      }

      const hadUnawaitedQueries = transaction.queries.size > 0;
      if (hadUnawaitedQueries) await Promise.allSettled(transaction.queries);
      if (callbackFailed) throw callbackError;
      if (hadUnawaitedQueries) throw new UnawaitedPostgresQueryError();
      return result as TResult;
    })).catch(rejectDatabaseFailure);
  };

  const streamRows = async function* <TResult>(
    statement: PostgresCompiledQuery,
    stream: PostgresRowStreamOptions,
  ): AsyncGenerator<readonly TResult[]> {
    assertOpen();
    if (transactions.getStore() !== undefined) {
      throw new PostgresRowStreamInTransactionError();
    }
    if (stream.signal.aborted) return;

    const batchSize = positiveInteger(stream.batchSize, "batchSize");
    const reserved = await client.reserve().catch(rejectDatabaseFailure);
    let transactionOpen = false;
    let releasePromise: Promise<void> | undefined;
    const releaseReserved = (cancelled: boolean): Promise<void> => {
      releasePromise ??= (async () => {
        let failure: unknown;
        try {
          if (cancelled) await reserved.close();
          else if (transactionOpen) await reserved.unsafe("ROLLBACK");
        } catch (error) {
          failure = error;
        }
        try {
          await Promise.resolve(reserved.release());
        } catch (error) {
          failure ??= error;
        }
        if (failure !== undefined && !cancelled) throw failure;
      })();
      return releasePromise;
    };
    const abort = (): void => {
      void releaseReserved(true).catch(() => undefined);
    };
    stream.signal.addEventListener("abort", abort, { once: true });

    try {
      if (stream.signal.aborted) return;
      await reserved.unsafe("BEGIN READ ONLY");
      transactionOpen = true;
      await reserved.unsafe(
        `DECLARE spark_row_stream NO SCROLL CURSOR FOR ${statement.sql}`,
        [...statement.params],
      );

      while (!stream.signal.aborted) {
        const rows = await reserved.unsafe<TResult[]>(
          `FETCH FORWARD ${batchSize} FROM spark_row_stream`,
        );
        if (stream.signal.aborted || rows.length === 0) break;
        yield rows;
      }

      if (stream.signal.aborted) return;
      await reserved.unsafe("CLOSE spark_row_stream");
      await reserved.unsafe("COMMIT");
      transactionOpen = false;
    } catch (error) {
      if (!stream.signal.aborted) rejectDatabaseFailure(error);
    } finally {
      stream.signal.removeEventListener("abort", abort);
      await releaseReserved(stream.signal.aborted);
    }
  };

  const scope = <const TScope extends PostgresSchema>(schema: TScope): PostgresScope<TScope> => {
    for (const [key, value] of Object.entries(schema)) {
      if (!Object.hasOwn(options.schema, key)) {
        throw new TypeError(`PostgreSQL runtime does not contain schema key '${key}'`);
      }
      if (options.schema[key] !== value) {
        throw new TypeError(`PostgreSQL runtime schema value for '${key}' does not match`);
      }
    }

    return Object.freeze({
      query<TResult>(
        callback: (scoped: PostgresQueryClient<TScope>) => Promise<TResult>,
      ): Promise<TResult> {
        return query((aggregate) => callback(aggregate as PostgresQueryClient<TScope>));
      },
      streamRows,
      transact,
    });
  };

  return Object.freeze({
    schema: options.schema,
    ready,
    query,
    streamRows,
    transact,
    scope,
    close,
  });
}
