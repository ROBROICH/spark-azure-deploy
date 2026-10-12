import type { PostgresScope } from "@spark-workflow/postgres-runtime";

import type { HistoryQuery, HistoryResponse } from "./history/types.ts";
import { readHistory } from "./routes/read-history.ts";

export interface ProtocolHistory {
  read(query: HistoryQuery): Promise<HistoryResponse>;
}

export function createProtocolHistory(
  resolvePostgres: () => Promise<PostgresScope<{}>>,
): ProtocolHistory {
  return Object.freeze<ProtocolHistory>({
    async read(query) {
      const result = await readHistory(await resolvePostgres(), query);
      if (result.isErr()) throw result.error;
      return result.value;
    },
  });
}
