import {
  createPostgresRuntime,
  type PostgresRuntime,
} from "@spark-workflow/postgres-runtime";
import { RechtsmethodikWorkflowOutput, Value } from "@spark-temporal/contracts";
import { Type, type Static } from "@sinclair/typebox";
import { SQL } from "bun";
import camelcaseKeys, {
  type Options as CamelCaseOptions,
} from "camelcase-keys";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";

type JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | JsonObject;
interface JsonObject {
  readonly [key: string]: JsonValue;
}

const deepCamelCaseOptions: CamelCaseOptions = { deep: true };

const JsonValue = Type.Unsafe<JsonValue>(
  Type.Recursive((self) =>
    Type.Union([
      Type.Null(),
      Type.Boolean(),
      Type.Number(),
      Type.String(),
      Type.Array(self),
      Type.Record(Type.String(), self),
    ]),
  ),
);
const JsonObject = Type.Record(Type.String(), JsonValue);

const NormCacheRow = Type.Object({
  id: Type.String({ format: "uuid" }),
  jurabk: Type.String(),
  paragraph: Type.String(),
  deconstruction: JsonObject,
  createdAt: Type.String(),
  updatedAt: Type.String(),
});
type NormCacheRow = Static<typeof NormCacheRow>;

interface CanonicalNormCacheRow {
  readonly id: string;
  readonly jurabk: string;
  readonly paragraph: string;
  readonly deconstruction: JsonObject;
  readonly createdAt: string;
  readonly updatedAt: string;
}

interface CacheSummary {
  readonly rows: number;
  readonly uniqueKeys: number;
  readonly fingerprint: string;
}

const usage =
  "Usage: NORM_CACHE_SOURCE_URL=postgresql://... [NORM_CACHE_TARGET_URL=postgresql://...] " +
  "pnpm --filter @spark-workflow/examination-service cache:canonicalize -- <check|transfer>";
const mode = Bun.argv[2];
if (mode !== "check" && mode !== "transfer") throw new TypeError(usage);

const sourceUrl = process.env.NORM_CACHE_SOURCE_URL;
if (sourceUrl === undefined || sourceUrl.length === 0)
  throw new TypeError(usage);
const targetUrl = process.env.NORM_CACHE_TARGET_URL;
if (
  mode === "transfer" &&
  (targetUrl === undefined || targetUrl.length === 0)
) {
  throw new TypeError(usage);
}
if (targetUrl === sourceUrl)
  throw new TypeError("Source and target PostgreSQL URLs must differ");

const abort = new AbortController();
process.once("SIGINT", () => abort.abort());
process.once("SIGTERM", () => abort.abort());

function assertNoCamelCaseCollision(
  value: JsonValue,
  path: string,
  keyCache: Map<string, string>,
): void {
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      assertNoCamelCaseCollision(item, `${path}[${index}]`, keyCache);
    }
    return;
  }
  if (!Value.Check(JsonObject, value)) return;

  const sourceByCanonicalKey = new Map<string, string>();
  for (const [key, item] of Object.entries(value)) {
    let canonicalKey = keyCache.get(key);
    if (canonicalKey === undefined) {
      canonicalKey = Object.keys(camelcaseKeys({ [key]: null }))[0];
      if (canonicalKey === undefined)
        throw new TypeError(`Could not canonicalize key at ${path}`);
      keyCache.set(key, canonicalKey);
    }
    const previous = sourceByCanonicalKey.get(canonicalKey);
    if (previous !== undefined && previous !== key) {
      throw new TypeError(
        `Camel-case collision at ${path}: '${previous}' and '${key}' both become '${canonicalKey}'`,
      );
    }
    sourceByCanonicalKey.set(canonicalKey, key);
    assertNoCamelCaseCollision(item, `${path}.${key}`, keyCache);
  }
}

async function scanCache(
  runtime: PostgresRuntime<Record<string, never>>,
  writeBatch?: (rows: readonly CanonicalNormCacheRow[]) => Promise<void>,
  requireCanonicalStorage = false,
): Promise<CacheSummary> {
  const keys = new Set<string>();
  const keyCache = new Map<string, string>();
  const fingerprint = createHash("sha256");
  let rows = 0;

  for await (const batch of runtime.streamRows<unknown>(
    {
      sql: `
        SELECT
          id::text AS id,
          jurabk,
          paragraph,
          deconstruction,
          to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "createdAt",
          to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "updatedAt"
        FROM public.norm_deconstruction
        ORDER BY jurabk, paragraph
      `,
      params: [],
    },
    { batchSize: 50, signal: abort.signal },
  )) {
    const canonicalBatch: CanonicalNormCacheRow[] = [];
    for (const rawRow of batch) {
      if (!Value.Check(NormCacheRow, rawRow)) {
        throw new TypeError(
          "norm_deconstruction contains an invalid physical row",
        );
      }
      const row = Value.Parse(NormCacheRow, rawRow);

      assertNoCamelCaseCollision(
        row.deconstruction,
        `${row.jurabk}/${row.paragraph}`,
        keyCache,
      );
      const canonicalValue = camelcaseKeys(
        row.deconstruction,
        deepCamelCaseOptions,
      );
      if (!Value.Check(RechtsmethodikWorkflowOutput, canonicalValue)) {
        throw new TypeError(
          `Norm deconstruction does not satisfy RechtsmethodikWorkflowOutput: ${row.jurabk}/${row.paragraph}`,
        );
      }
      const deconstruction = canonicalValue;
      if (
        requireCanonicalStorage &&
        !isDeepStrictEqual(row.deconstruction, deconstruction)
      ) {
        throw new TypeError(
          `Target norm deconstruction is not stored canonically: ${row.jurabk}/${row.paragraph}`,
        );
      }
      if (
        deconstruction.jurabk !== row.jurabk ||
        deconstruction.paragraphNr !== row.paragraph
      ) {
        throw new TypeError(
          `Norm deconstruction identity differs from its cache key: ${row.jurabk}/${row.paragraph}`,
        );
      }

      const key = `${row.jurabk}\u0000${row.paragraph}`;
      if (keys.has(key))
        throw new TypeError(
          `Duplicate norm cache key: ${row.jurabk}/${row.paragraph}`,
        );
      keys.add(key);
      const canonicalRow = { ...row, deconstruction };
      canonicalBatch.push(canonicalRow);
      fingerprint.update(
        `${row.id}\u0000${row.jurabk}\u0000${row.paragraph}\u0000${JSON.stringify(deconstruction)}\u0000${row.createdAt}\u0000${row.updatedAt}\n`,
      );
      rows += 1;
    }
    if (writeBatch !== undefined) await writeBatch(canonicalBatch);
  }

  if (abort.signal.aborted)
    throw new Error("Norm cache operation was interrupted");
  return {
    rows,
    uniqueKeys: keys.size,
    fingerprint: fingerprint.digest("hex"),
  };
}

const source = createPostgresRuntime({
  url: sourceUrl,
  schema: {},
  pool: { maxConnections: 1 },
});
let target: SQL | undefined;
let sourceLock: SQL | undefined;
try {
  await source.ready();
  if (mode === "check") {
    console.log(JSON.stringify({ mode, source: await scanCache(source) }));
    process.exitCode = 0;
  } else {
    sourceLock = new SQL(sourceUrl, { max: 1, prepare: false });
    target = new SQL(targetUrl!, { max: 1, prepare: false });
    await Promise.all([sourceLock.connect(), target.connect()]);
    const sourceSummary = await sourceLock.begin(async (sourceTransaction) => {
      await sourceTransaction`LOCK TABLE public.norm_deconstruction IN SHARE MODE`;
      return target!.begin(async (transaction) => {
        await transaction`LOCK TABLE public.norm_deconstruction IN ACCESS EXCLUSIVE MODE`;
        const [existing] = await transaction<{ count: number }[]>`
          SELECT count(*)::int AS count FROM public.norm_deconstruction
        `;
        if (existing?.count !== 0) {
          throw new TypeError("Target norm_deconstruction table must be empty");
        }

        const summary = await scanCache(source, async (batch) => {
          const insertRows = batch.map((row) => ({
            id: row.id,
            jurabk: row.jurabk,
            paragraph: row.paragraph,
            deconstruction: JSON.stringify(row.deconstruction),
            created_at: row.createdAt,
            updated_at: row.updatedAt,
          }));
          const returnedRows = await transaction<unknown[]>`
            INSERT INTO public.norm_deconstruction
            ${transaction(
              insertRows,
              "id",
              "jurabk",
              "paragraph",
              "deconstruction",
              "created_at",
              "updated_at",
            )}
            RETURNING
              id::text AS id,
              jurabk,
              paragraph,
              deconstruction,
              to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "createdAt",
              to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "updatedAt"
          `;
          const expectedById = new Map(batch.map((row) => [row.id, row]));
          for (const rawRow of returnedRows) {
            if (!Value.Check(NormCacheRow, rawRow)) {
              throw new TypeError(
                "Target norm_deconstruction returned an invalid physical row",
              );
            }
            const returned = Value.Parse(NormCacheRow, rawRow);
            const expected = expectedById.get(returned.id);
            if (
              expected === undefined ||
              !isDeepStrictEqual(returned, expected)
            ) {
              throw new Error(
                `Target norm deconstruction changed during insert: ${returned.jurabk}/${returned.paragraph}`,
              );
            }
            expectedById.delete(returned.id);
          }
          if (expectedById.size !== 0) {
            throw new Error(
              "Target norm_deconstruction did not return every inserted row",
            );
          }
        });

        const [inserted] = await transaction<
          { rows: number; uniqueKeys: number }[]
        >`
          SELECT
            count(*)::int AS rows,
            count(DISTINCT (jurabk, paragraph))::int AS "uniqueKeys"
          FROM public.norm_deconstruction
        `;
        if (
          inserted?.rows !== summary.rows ||
          inserted.uniqueKeys !== summary.uniqueKeys
        ) {
          throw new Error("Target norm cache counts differ before commit");
        }
        return summary;
      });
    });

    const targetRuntime = createPostgresRuntime({
      url: targetUrl!,
      schema: {},
      pool: { maxConnections: 1 },
    });
    try {
      await targetRuntime.ready();
      const targetSummary = await scanCache(targetRuntime, undefined, true);
      if (
        targetSummary.rows !== sourceSummary.rows ||
        targetSummary.uniqueKeys !== sourceSummary.uniqueKeys ||
        targetSummary.fingerprint !== sourceSummary.fingerprint
      ) {
        throw new Error(
          "Committed target norm cache differs from the canonical source",
        );
      }
      console.log(
        JSON.stringify({ mode, source: sourceSummary, target: targetSummary }),
      );
    } finally {
      await targetRuntime.close();
    }
  }
} finally {
  await Promise.allSettled([
    source.close(),
    sourceLock?.close({ timeout: 10 }),
    target?.close({ timeout: 10 }),
  ]);
}
