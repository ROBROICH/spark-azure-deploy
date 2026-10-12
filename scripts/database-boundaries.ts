import { existsSync } from "node:fs";
import { resolve } from "node:path";

interface ColumnSnapshot {
  default?: unknown;
  name: string;
  notNull: boolean;
  type: string;
}

interface TableSnapshot {
  columns: Record<string, ColumnSnapshot>;
  foreignKeys?: Record<
    string,
    {
      columnsFrom: string[];
      columnsTo: string[];
      name: string;
      tableFrom: string;
      tableTo: string;
    }
  >;
  indexes: Record<string, { name: string }>;
  name: string;
}

interface Snapshot {
  tables: Record<string, TableSnapshot>;
}

interface Journal {
  entries: { idx: number; tag: string }[];
}

interface DatabaseBoundaries {
  deferrableForeignKeys?: { name: string; table: string }[];
  history: { source: string; target: string }[];
  updatedAt: string[];
}

const [command, requestedDirectory] = process.argv.slice(2);
if (command !== "generate" && command !== "check") {
  throw new Error("Usage: database-boundaries.ts <generate|check> [migrations-directory]");
}

const migrationsDirectory = resolve(
  requestedDirectory ??
    (existsSync(resolve("src/migrations/meta/_journal.json")) ? "src/migrations" : "migrations"),
);
const journal = (await Bun.file(
  resolve(migrationsDirectory, "meta/_journal.json"),
).json()) as Journal;
const latest = journal.entries.at(-1);
if (latest === undefined) throw new Error("Drizzle migration journal is empty");
const snapshot = (await Bun.file(
  resolve(migrationsDirectory, "meta", `${String(latest.idx).padStart(4, "0")}_snapshot.json`),
).json()) as Snapshot;

const tableByName = new Map(
  Object.values(snapshot.tables).map((table) => {
    if (!/^[a-z_][a-z0-9_]*$/.test(table.name)) {
      throw new Error(`Unsupported PostgreSQL table name: ${table.name}`);
    }
    return [table.name, table] as const;
  }),
);

function historyIsCompatible(source: TableSnapshot, history: TableSnapshot): boolean {
  const sourceColumns = new Map(
    Object.values(source.columns).map((column) => [column.name, column]),
  );
  return Object.values(history.columns).every((column) => {
    const sourceColumn = sourceColumns.get(column.name);
    return sourceColumn === undefined
      ? !column.notNull || column.default !== undefined
      : sourceColumn.type === column.type;
  });
}

const history = [...tableByName.values()]
  .filter((table) => table.name.endsWith("_history"))
  .map((target) => {
    const sourceName = target.name.slice(0, -"_history".length);
    const source = tableByName.get(sourceName);
    if (source === undefined) throw new Error(`${target.name} has no source table ${sourceName}`);
    if (source.columns.sys_period === undefined || target.columns.sys_period === undefined) {
      throw new Error(`${sourceName} and ${target.name} must both declare sys_period`);
    }
    if (!historyIsCompatible(source, target)) {
      throw new Error(`${target.name} is incompatible with ${sourceName}`);
    }
    for (const column of ["id", "sys_period"]) {
      const indexName = `${target.name}_${column}_idx`;
      if (target.indexes[indexName] === undefined) {
        throw new Error(`${target.name} is missing ${indexName}`);
      }
    }
    return { source: sourceName, target: target.name };
  })
  .sort((left, right) => left.source.localeCompare(right.source));

const updatedAt = [...tableByName.values()]
  .filter((table) => !table.name.endsWith("_history") && table.columns.updated_at !== undefined)
  .map(({ name }) => name)
  .sort();

const deferrableForeignKeys = [...tableByName.values()]
  .flatMap((table) =>
    Object.values(table.foreignKeys ?? {})
      .filter((foreignKey) => {
        const target = tableByName.get(foreignKey.tableTo);
        return (
          table.columns.sys_period !== undefined &&
          target?.columns.sys_period !== undefined &&
          foreignKey.columnsFrom.includes("project_version") &&
          foreignKey.columnsTo.includes("project_version")
        );
      })
      .map((foreignKey) => {
        if (!/^[a-z_][a-z0-9_]*$/.test(foreignKey.name)) {
          throw new Error(`Unsupported PostgreSQL constraint name: ${foreignKey.name}`);
        }
        return { name: foreignKey.name, table: table.name };
      }),
  )
  .sort((left, right) =>
    `${left.table}.${left.name}`.localeCompare(`${right.table}.${right.name}`),
  );

const boundaries: DatabaseBoundaries = {
  history,
  updatedAt,
};
if (deferrableForeignKeys.length > 0) boundaries.deferrableForeignKeys = deferrableForeignKeys;
const quote = (identifier: string) => `"${identifier}"`;
const versioningSql = history.length
  ? await Bun.file(resolve(import.meta.dir, "database-versioning.sql")).text()
  : "";
const historyKey = ({ source, target }: { source: string; target: string }) =>
  `${source}\0${target}`;
const foreignKeyKey = ({ table, name }: { table: string; name: string }) => `${table}\0${name}`;
const versioningTrigger = (source: string, target: string) =>
  `CREATE TRIGGER versioning_trigger BEFORE INSERT OR UPDATE OR DELETE ON ${quote(source)} FOR EACH ROW EXECUTE FUNCTION versioning('sys_period', '${target}', true)`;
const updatedAtTrigger = (table: string) =>
  `CREATE TRIGGER set_updated_at BEFORE UPDATE ON ${quote(table)} FOR EACH ROW EXECUTE FUNCTION database_set_updated_at()`;
const updatedAtFunction = `CREATE OR REPLACE FUNCTION database_set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END
$$`;

const currentBoundary = [...journal.entries]
  .reverse()
  .find((entry) => /^\d{4}_database_boundaries$/.test(entry.tag));
const previousBoundary = journal.entries
  .slice(0, currentBoundary?.idx ?? journal.entries.length)
  .reverse()
  .find((entry) => /^\d{4}_database_boundaries$/.test(entry.tag));
const previousBoundaries = previousBoundary
  ? (JSON.parse(
      /^-- database-boundaries: ({.*})$/m.exec(
        await Bun.file(resolve(migrationsDirectory, `${previousBoundary.tag}.sql`)).text(),
      )?.[1] ??
        (() => {
          throw new Error(`${previousBoundary.tag}.sql is missing a database-boundaries header`);
        })(),
    ) as DatabaseBoundaries)
  : undefined;

function fullStatements(): string[] {
  const statements: string[] = [];
  if (versioningSql) statements.push(versioningSql.trim());
  for (const foreignKey of deferrableForeignKeys) {
    statements.push(
      `ALTER TABLE ${quote(foreignKey.table)} ALTER CONSTRAINT ${quote(foreignKey.name)} DEFERRABLE INITIALLY DEFERRED`,
    );
  }
  for (const { source, target } of history) {
    statements.push(`DROP TRIGGER IF EXISTS versioning_trigger ON ${quote(source)}`);
    statements.push(versioningTrigger(source, target));
  }
  if (updatedAt.length > 0) {
    const relations = updatedAt.map((table) => `'${quote(table)}'::regclass`).join(", ");
    const drops = updatedAt
      .flatMap((table) =>
        ["set_updated_at", "set_updated_at_trigger"].map(
          (trigger) => `  DROP TRIGGER IF EXISTS ${trigger} ON ${quote(table)};`,
        ),
      )
      .join("\n");
    statements.push(`DO $$
DECLARE
  previous_functions text[];
  previous_function text;
BEGIN
  SELECT array_agg(DISTINCT procedure.oid::regprocedure::text)
  INTO previous_functions
  FROM pg_trigger AS trigger
  JOIN pg_proc AS procedure ON procedure.oid = trigger.tgfoid
  WHERE NOT trigger.tgisinternal
    AND trigger.tgname IN ('set_updated_at', 'set_updated_at_trigger')
    AND trigger.tgrelid = ANY (ARRAY[${relations}]);
${drops}
  IF previous_functions IS NOT NULL THEN
    FOREACH previous_function IN ARRAY previous_functions LOOP
      EXECUTE 'DROP FUNCTION ' || previous_function;
    END LOOP;
  END IF;
END
$$`);
    statements.push(updatedAtFunction);
    for (const table of updatedAt) statements.push(updatedAtTrigger(table));
  }
  return statements;
}

function deltaStatements(previous: DatabaseBoundaries): string[] {
  const statements: string[] = [];
  const previousHistory = new Set((previous.history ?? []).map(historyKey));
  const currentHistory = new Set(history.map(historyKey));
  const previousUpdatedAt = new Set(previous.updatedAt ?? []);
  const previousForeignKeys = new Set((previous.deferrableForeignKeys ?? []).map(foreignKeyKey));
  const addedHistory = history.filter((pair) => !previousHistory.has(historyKey(pair)));
  const removedHistory = (previous.history ?? []).filter(
    (pair) => !currentHistory.has(historyKey(pair)),
  );
  const addedUpdatedAt = updatedAt.filter((table) => !previousUpdatedAt.has(table));
  const removedUpdatedAt = [...previousUpdatedAt].filter((table) => !updatedAt.includes(table));
  const addedForeignKeys = deferrableForeignKeys.filter(
    (foreignKey) => !previousForeignKeys.has(foreignKeyKey(foreignKey)),
  );

  if ((previous.history ?? []).length === 0 && history.length > 0 && versioningSql) {
    statements.push(versioningSql.trim());
  }
  for (const foreignKey of addedForeignKeys) {
    statements.push(
      `ALTER TABLE ${quote(foreignKey.table)} ALTER CONSTRAINT ${quote(foreignKey.name)} DEFERRABLE INITIALLY DEFERRED`,
    );
  }
  for (const { source } of removedHistory) {
    statements.push(`DROP TRIGGER IF EXISTS versioning_trigger ON ${quote(source)}`);
  }
  for (const { source, target } of addedHistory) {
    statements.push(versioningTrigger(source, target));
  }
  for (const table of removedUpdatedAt) {
    statements.push(`DROP TRIGGER IF EXISTS set_updated_at ON ${quote(table)}`);
    statements.push(`DROP TRIGGER IF EXISTS set_updated_at_trigger ON ${quote(table)}`);
  }
  if ((previous.updatedAt ?? []).length === 0 && addedUpdatedAt.length > 0) {
    statements.push(updatedAtFunction);
  }
  for (const table of addedUpdatedAt) statements.push(updatedAtTrigger(table));
  return statements;
}

const renderSql = (parts: string[]) =>
  [
    "-- Generated by scripts/database-boundaries.ts. Do not edit.",
    `-- database-boundaries: ${JSON.stringify(boundaries)}`,
    "",
    ...(parts.length > 0 ? [parts.join(";\n--> statement-breakpoint\n") + ";", ""] : []),
  ].join("\n");

const statements =
  previousBoundaries === undefined ? fullStatements() : deltaStatements(previousBoundaries);
const boundary = currentBoundary;
if (boundary === undefined) {
  if (statements.length > 0) {
    throw new Error("Migration history must contain a custom database-boundaries migration");
  }
} else {
  const boundaryFile = resolve(migrationsDirectory, `${boundary.tag}.sql`);
  const sql = renderSql(statements);
  if (command === "generate") {
    await Bun.write(boundaryFile, sql);
  } else {
    const existing = await Bun.file(boundaryFile).text();
    const header = /^-- database-boundaries: ({.*})$/m.exec(existing)?.[1];
    if (header === undefined) {
      throw new Error(`${boundary.tag}.sql is missing a database-boundaries header`);
    }
    if (header !== JSON.stringify(boundaries)) {
      throw new Error("Database boundary migration does not match the latest Drizzle snapshot");
    }
    const delta =
      previousBoundaries === undefined ? fullStatements() : deltaStatements(previousBoundaries);
    if (previousBoundaries === undefined || delta.length > 0) {
      if (existing !== sql) {
        throw new Error("Database boundary migration does not match the latest Drizzle snapshot");
      }
    }
  }
}

if (command === "generate") {
  console.log(
    previousBoundaries === undefined
      ? `generated ${history.length} history, ${updatedAt.length} updated_at, and ${deferrableForeignKeys.length} deferrable foreign-key boundaries`
      : `generated ${statements.length} boundary adjustment(s)`,
  );
}
