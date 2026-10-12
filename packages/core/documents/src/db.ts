import type { PostgresQueryClient, PostgresScope } from "@spark-workflow/postgres-runtime";
import { better } from "better-drizzle";

import { documentManagementSchema } from "./db/schema.ts";

export type DmsDatabase = PostgresQueryClient<typeof documentManagementSchema>;
export type DmsScope = PostgresScope<typeof documentManagementSchema>;
export const dmsModels = (database: DmsDatabase) =>
  better(database, { schema: documentManagementSchema });
