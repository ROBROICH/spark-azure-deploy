import { getTableColumns, sql, type SQL } from "drizzle-orm";

import { projects } from "./db/schema.ts";
import type { ProjectLogicDatabase } from "./db.ts";

type ProjectRow = typeof projects.$inferSelect;

const NEGATIVE_INFINITY = "-infinity";
const POSITIVE_INFINITY = "infinity";
const NEGATIVE_INFINITY_PUBLIC_DATE = "0001-01-01";
const POSITIVE_INFINITY_PUBLIC_DATE = "9999-12-31";

export async function loadProjectRows(
  database: ProjectLogicDatabase,
  where: SQL<unknown> | undefined,
  limit?: number,
  offset = 0,
  orderBy: SQL[] = [],
): Promise<ProjectRow[]> {
  const query = database
    .select({
      ...getTableColumns(projects),
      entryDate: sql<ProjectRow["entryDate"]>`CASE ${projects.entryDate}::text
        WHEN ${NEGATIVE_INFINITY} THEN ${NEGATIVE_INFINITY_PUBLIC_DATE}
        WHEN ${POSITIVE_INFINITY} THEN ${POSITIVE_INFINITY_PUBLIC_DATE}
        ELSE ${projects.entryDate}::text
      END`.as("entry_date"),
    })
    .from(projects)
    .where(where)
    .orderBy(...orderBy)
    .offset(offset);
  return limit === undefined ? await query : await query.limit(limit);
}

export function projectEntryDateForStorage(
  value: string | null | undefined,
): string | null | undefined {
  if (value === NEGATIVE_INFINITY_PUBLIC_DATE) return NEGATIVE_INFINITY;
  if (value === POSITIVE_INFINITY_PUBLIC_DATE) return POSITIVE_INFINITY;
  return value;
}
