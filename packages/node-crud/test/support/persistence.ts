import type { NodeCompiledQuery, NodeRowStreamOptions } from "../../src";

export async function* emptyNodeRowStream(
  _statement: NodeCompiledQuery,
  _options: NodeRowStreamOptions,
): AsyncGenerator<readonly never[]> {
  yield* [];
}
