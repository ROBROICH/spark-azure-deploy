import type { PostgresScope } from "@spark-workflow/postgres-runtime";
import { type Static, Type as T } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import { Result, type Result as ResultType } from "better-result";

import { protocolErrors } from "../errors.ts";
import { temporalHistoryStatement } from "../history/postgres.ts";
import {
  type HistoryChangeType,
  type HistoryQuery,
  type HistoryResponse,
  serviceLabels,
} from "../history/types.ts";
import { protocolSourceDefinitions } from "../sources.ts";

import type { HttpJson } from "@spark-workflow/http-host";
type ProtocolSourceUnavailableError = ReturnType<typeof protocolErrors.SOURCE_UNAVAILABLE>;

const NullableStringSchema = T.Union([T.String(), T.Null()]);
const HistoryRowObjectSchema = T.Object({}, { additionalProperties: true });
const ProtocolDatabaseRowSchema = T.Object(
  {
    entity_type: T.String(),
    change_type: T.String(),
    id: NullableStringSchema,
    update_type: NullableStringSchema,
    timestamp: T.String(),
    new_row: T.Union([HistoryRowObjectSchema, T.Null()]),
    old_row: T.Union([HistoryRowObjectSchema, T.Null()]),
    actor_user_id: NullableStringSchema,
    triggered_by_user_id: NullableStringSchema,
    workflow_run_id: NullableStringSchema,
    workflow_type: NullableStringSchema,
    action_type: NullableStringSchema,
    request_id: NullableStringSchema,
    group_count: T.String(),
    total_count: T.String(),
  },
  { additionalProperties: false },
);

const internalRowKeys = new Set(["sys_period", "timestamp", "change_type", "update_type"]);
const timestampPattern =
  /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}(?::?\d{2})?)?$/;

function normalizeTimestamp(value: string): string {
  const match = timestampPattern.exec(value.trim());
  if (!match) throw new TypeError(`Protocol history contains invalid timestamp '${value}'`);
  const [, date, time, fraction = "", rawZone = "Z"] = match;
  if (!date || !time) throw new TypeError(`Protocol history contains invalid timestamp '${value}'`);
  const zone = /^[+-]\d{2}$/u.test(rawZone)
    ? `${rawZone}:00`
    : /^[+-]\d{4}$/u.test(rawZone)
      ? `${rawZone.slice(0, 3)}:${rawZone.slice(3)}`
      : rawZone;
  const paddedFraction = fraction.padEnd(6, "0").slice(0, 6);
  const milliseconds = Date.parse(`${date}T${time}.${paddedFraction.slice(0, 3)}${zone}`);
  if (!Number.isFinite(milliseconds)) {
    throw new TypeError(`Protocol history contains invalid timestamp '${value}'`);
  }
  const seconds = new Date(milliseconds).toISOString().slice(0, 19);
  return `${seconds}${paddedFraction === "000000" ? "" : `.${paddedFraction}`}Z`;
}

function changeType(value: string): HistoryChangeType {
  if (value === "create" || value === "update" || value === "delete" || value === "action") {
    return value;
  }
  throw new TypeError(`Protocol history contains unsupported change type '${String(value)}'`);
}

function publicRow(
  value: Static<typeof HistoryRowObjectSchema> | null,
): { [key: string]: HttpJson } | null {
  if (value === null) return null;
  const row: { [key: string]: HttpJson } = {};
  for (const [key, nested] of Object.entries(value)) {
    if (!internalRowKeys.has(key)) row[key] = nested as HttpJson;
  }
  return row;
}

export async function readHistory(
  postgres: PostgresScope<{}>,
  query: HistoryQuery,
): Promise<ResultType<HistoryResponse, ProtocolSourceUnavailableError>> {
  const selected = protocolSourceDefinitions.filter(
    (definition) => query.service === null || definition.source === query.service,
  );
  if (selected.length === 0) {
    return Result.ok({ total: 0, limit: query.limit, offset: query.offset, items: [] });
  }
  const tables = selected.flatMap((definition) =>
    definition.tables.map(({ name, projectColumn }) => ({ name, projectColumn })),
  );
  const statement = temporalHistoryStatement({
    tables,
    projectId: query.projectId,
    from: query.from,
    to: query.to,
    source: query.source,
    workflowRunId: query.workflowRunId,
    requestId: query.requestId,
    collapsed: query.collapsed,
    limit: query.offset + query.limit,
  });
  const queried = await Result.tryPromise({
    try: () =>
      postgres.query((database) =>
        database.execute<Static<typeof ProtocolDatabaseRowSchema>>(statement),
      ),
    catch: (cause) =>
      protocolErrors.SOURCE_UNAVAILABLE({
        cause: cause instanceof Error ? cause : undefined,
        internal: { sources: selected.map(({ source }) => source) },
      }),
  });
  if (queried.isErr()) return queried;
  const rows = queried.value.map((row) => Value.Parse(ProtocolDatabaseRowSchema, row));
  const total = rows.length === 0 ? 0 : Number(rows[0]?.total_count);
  if (!Number.isSafeInteger(total) || total < 0) {
    throw new TypeError(
      `Protocol history contains invalid total_count '${String(rows[0]?.total_count)}'`,
    );
  }
  return Result.ok({
    total,
    limit: query.limit,
    offset: query.offset,
    items: rows.slice(query.offset, query.offset + query.limit).map((row) => {
      const definition = selected.find(({ tables }) =>
        tables.some(({ name }) => name === row.entity_type),
      );
      if (definition === undefined)
        throw protocolErrors.SOURCE_UNAVAILABLE({ internal: { entityType: row.entity_type } });
      const groupCount = Number(row.group_count);
      if (!Number.isSafeInteger(groupCount) || groupCount < 1) {
        throw new TypeError(`Protocol history contains invalid group_count '${row.group_count}'`);
      }
      return {
        timestamp: normalizeTimestamp(row.timestamp),
        entityType: row.entity_type,
        entityId: row.id,
        service: definition.source,
        serviceLabel: serviceLabels[definition.source],
        changeType: changeType(row.change_type),
        source:
          row.workflow_run_id === null && row.workflow_type === null && row.actor_user_id !== null
            ? "user"
            : "agent",
        actorUserId: row.actor_user_id,
        triggeredByUserId: row.triggered_by_user_id,
        workflowRunId: row.workflow_run_id,
        workflowType: row.workflow_type,
        actionType: row.action_type,
        requestId: row.request_id,
        oldRow: publicRow(row.old_row),
        newRow: publicRow(row.new_row),
        groupCount,
      };
    }),
  });
}
