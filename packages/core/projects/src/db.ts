import type { PostgresQueryClient, PostgresScope } from "@spark-workflow/postgres-runtime";
import { better } from "better-drizzle";

import { projectLogicSchema } from "./db/schema.ts";

export type ProjectLogicDatabase = PostgresQueryClient<typeof projectLogicSchema>;
export type ProjectLogicScope = PostgresScope<typeof projectLogicSchema>;
export const projectLogicModels = (database: ProjectLogicDatabase) =>
  better(database, { schema: projectLogicSchema });
