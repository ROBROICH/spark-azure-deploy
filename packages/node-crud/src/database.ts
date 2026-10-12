import type { BunSQLDatabase } from "drizzle-orm/bun-sql";
import type { Relations } from "drizzle-orm";
import type { AnyPgTable } from "drizzle-orm/pg-core";

interface PostgresEnumDefinition {
  readonly enumName: string;
  readonly enumValues: readonly string[];
  readonly schema: string | undefined;
}

export type NodeSchema = Record<string, AnyPgTable | Relations | PostgresEnumDefinition>;

export type NodeDatabase<Schema extends NodeSchema> = Pick<
  BunSQLDatabase<Schema>,
  "delete" | "insert" | "select" | "update"
>;
