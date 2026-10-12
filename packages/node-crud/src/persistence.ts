import type { NodeDatabase, NodeSchema } from "./database";

export interface NodeCompiledQuery {
  readonly sql: string;
  readonly params: readonly unknown[];
}

export interface NodeRowStreamOptions {
  readonly batchSize: number;
  readonly signal: AbortSignal;
}

export interface NodeStreamRow {
  readonly node_json: string;
}

export interface NodePersistence<Schema extends NodeSchema> {
  query<Result>(callback: (database: NodeDatabase<Schema>) => Promise<Result>): Promise<Result>;
  streamRows(
    statement: NodeCompiledQuery,
    options: NodeRowStreamOptions,
  ): AsyncIterable<readonly NodeStreamRow[]>;
  transact<Result>(callback: () => Promise<Result>): Promise<Result>;
}
