import { sql, type SQL, type SQLChunk } from "drizzle-orm";

interface PostgresTemporalHistoryTable {
  readonly name: string;
  readonly projectColumn: string;
}

interface PostgresTemporalHistoryOptions {
  readonly tables: readonly PostgresTemporalHistoryTable[];
  readonly projectId: string;
  readonly from: string | null;
  readonly to: string | null;
  readonly source: "user" | "agent" | "all" | null;
  readonly workflowRunId: string | null;
  readonly requestId: string | null;
  readonly collapsed: boolean;
  readonly limit: number;
}

const POSTGRES_IDENTIFIER = /^[a-z_][a-z0-9_]*$/;

function identifier(value: string, field: string): string {
  if (!POSTGRES_IDENTIFIER.test(value)) {
    throw new TypeError(`PostgreSQL temporal history ${field} must be a safe identifier`);
  }
  return `"${value}"`;
}

function parameterizedSql(text: string, parameters: readonly (number | string)[]): SQL {
  const chunks: SQLChunk[] = [];
  let offset = 0;
  for (const match of text.matchAll(/\$(\d+)/gu)) {
    const ordinal = Number(match[1]);
    const parameter = parameters[ordinal - 1];
    if (parameter === undefined) {
      throw new TypeError(`PostgreSQL temporal history parameter $${ordinal} is missing`);
    }
    chunks.push(sql.raw(text.slice(offset, match.index)), sql.param(parameter));
    offset = match.index + match[0].length;
  }
  chunks.push(sql.raw(text.slice(offset)));
  return sql.join(chunks);
}

export function temporalHistoryStatement(options: PostgresTemporalHistoryOptions): SQL {
  if (options.tables.length === 0) {
    throw new TypeError("PostgreSQL temporal history requires at least one table");
  }
  if (
    options.source !== null &&
    options.source !== "all" &&
    options.source !== "user" &&
    options.source !== "agent"
  ) {
    throw new TypeError("PostgreSQL temporal history source is unsupported");
  }
  if (!Number.isSafeInteger(options.limit) || options.limit <= 0) {
    throw new TypeError("PostgreSQL temporal history limit must be a positive integer");
  }

  const parameters: Array<number | string> = [];
  const parameter = (value: number | string, cast?: string): string => {
    parameters.push(value);
    return `$${parameters.length}${cast ? `::${cast}` : ""}`;
  };
  const project = parameter(options.projectId, "uuid");
  const from = options.from === null ? null : parameter(options.from, "timestamptz");
  const to = options.to === null ? null : parameter(options.to, "timestamptz");
  const workflowRunId = !options.workflowRunId ? null : parameter(options.workflowRunId, "text");
  const requestId = !options.requestId ? null : parameter(options.requestId, "text");
  const resultLimit = parameter(options.limit, "integer");
  const actionEntityTypes = options.tables.map(({ name }) => parameter(name, "text")).join(", ");
  const actionTableOrder = options.tables
    .map(({ name }, index) => `WHEN ${parameter(name, "text")} THEN ${index}`)
    .join(" ");

  const snapshots = options.tables.flatMap((definition, tableOrder) => {
    const projectColumn = identifier(definition.projectColumn, "project column");
    return [false, true].map((isHistory) => {
      const table = identifier(`${definition.name}${isHistory ? "_history" : ""}`, "table name");
      return `
        SELECT '${definition.name}'::text AS entity_type,
          ${tableOrder}::integer AS table_order,
          t.id,
          t.sys_period,
          to_jsonb(t.*) AS row_data,
          ${!isHistory}::boolean AS is_current,
          jsonb_build_array('${definition.name}', t.id, to_jsonb(t.*)->'project_version') AS entity_key
        FROM ${table} t
        WHERE t.${projectColumn} = ${project}
      `;
    });
  });

  const temporalEvents = `
    SELECT h.entity_type, 'create'::text AS change_type, h.id,
      h.row_data->>'update_type' AS update_type, lower(h.sys_period) AS ts,
      h.row_data AS new_row, NULL::jsonb AS old_row, h.table_order
    FROM temporal_rows h
    WHERE (h.is_current AND h.first_history_at IS NULL)
      OR (NOT h.is_current AND lower(h.sys_period) = h.first_history_at)
    UNION ALL
    SELECT h.entity_type, 'update'::text, h.id, h.row_data->>'update_type',
      upper(h.sys_period), n.row_data, h.row_data, h.table_order
    FROM temporal_rows h
    JOIN successor_rows n ON n.entity_key = h.entity_key AND n.starts_at = upper(h.sys_period)
    WHERE NOT h.is_current
    UNION ALL
    SELECT h.entity_type, 'delete'::text, h.id, h.row_data->>'update_type',
      upper(h.sys_period), NULL::jsonb, h.row_data, h.table_order
    FROM temporal_rows h
    WHERE NOT h.is_current AND NOT h.has_current
      AND upper(h.sys_period) = h.last_history_at
  `;

  const diffEvents = `
    SELECT
      events.entity_type,
      COALESCE(al.change_type, events.change_type) AS change_type,
      events.id,
      events.update_type,
      COALESCE(al.request_start_time, events.ts) AS ts,
      CASE WHEN al.change_type = 'delete' THEN NULL ELSE events.new_row END AS new_row,
      events.old_row,
      events.table_order,
      jsonb_build_array(events.entity_type, events.id, COALESCE(events.new_row, events.old_row)->'project_version', events.ts, events.change_type, al.id)::text AS stable_id,
      al.actor_user_id,
      al.triggered_by_user_id,
      al.workflow_run_id,
      al.workflow_type,
      al.action_type,
      al.request_id
    FROM (
      ${temporalEvents}
    ) events
    LEFT JOIN "audit_log" al ON
      al.project_id = ${project}
      AND al.entity_id = events.id
      AND al.entity_type = events.entity_type
      AND al.timestamp = events.ts
      AND al.change_type <> 'action'
  `;
  const actionEvents = `
    SELECT
      al.entity_type,
      'action'::text AS change_type,
      al.entity_id AS id,
      NULL::text AS update_type,
      COALESCE(al.request_start_time, al.timestamp) AS ts,
      NULL::jsonb AS new_row,
      NULL::jsonb AS old_row,
      CASE al.entity_type ${actionTableOrder} END AS table_order,
      jsonb_build_array(al.entity_type, al.entity_id, al.timestamp, 'action', al.id)::text AS stable_id,
      al.actor_user_id,
      al.triggered_by_user_id,
      al.workflow_run_id,
      al.workflow_type,
      al.action_type,
      al.request_id
    FROM "audit_log" al
    WHERE al.project_id = ${project}
      AND al.change_type = 'action'
      AND al.entity_type IN (${actionEntityTypes})
  `;
  const predicates: string[] = [];
  const isUser =
    "(workflow_run_id IS NULL AND workflow_type IS NULL AND actor_user_id IS NOT NULL)";
  if (options.source === "user") predicates.push(isUser);
  if (options.source === "agent") predicates.push(`NOT ${isUser}`);
  if (workflowRunId !== null) predicates.push(`workflow_run_id = ${workflowRunId}`);
  if (requestId !== null) predicates.push(`request_id = ${requestId}`);
  if (from !== null && to !== null) predicates.push(`ts BETWEEN ${from} AND ${to}`);
  else if (from !== null) predicates.push(`ts >= ${from}`);
  else if (to !== null) predicates.push(`ts <= ${to}`);
  const filter = predicates.length === 0 ? "" : `WHERE ${predicates.join(" AND ")}`;
  const filteredEvents = `
    SELECT *
    FROM (
      ${diffEvents}
      UNION ALL
      ${actionEvents}
    ) raw_events
    ${filter}
  `;
  const aggregate = options.collapsed
    ? `
      SELECT *, COUNT(*) OVER () AS total_count
      FROM (
        SELECT *
        FROM (
          SELECT
            tagged.*,
            ROW_NUMBER() OVER (
              PARTITION BY group_key
              ORDER BY ts ASC, table_order ASC, stable_id COLLATE "C" ASC
            ) AS rn,
            COUNT(*) OVER (PARTITION BY group_key)::integer AS group_count
          FROM (
            SELECT
              filtered.*,
              CASE
                WHEN filtered.workflow_run_id IS NOT NULL
                  THEN 'wf:' || filtered.workflow_run_id
                WHEN filtered.request_id IS NOT NULL
                  THEN 'req:' || filtered.request_id
                ELSE 'singleton:' || filtered.stable_id
              END AS group_key
            FROM (
              ${filteredEvents}
            ) filtered
          ) tagged
        ) windowed
        WHERE rn = 1
      ) collapsed_events
    `
    : `
      SELECT *, 1::integer AS group_count, COUNT(*) OVER () AS total_count
      FROM (
        ${filteredEvents}
      ) all_events
    `;

  return parameterizedSql(
    `
      WITH snapshots AS MATERIALIZED (
        ${snapshots.join("\nUNION ALL\n")}
      ), temporal_rows AS MATERIALIZED (
        SELECT *,
          min(lower(sys_period)) FILTER (WHERE NOT is_current) OVER entity AS first_history_at,
          max(upper(sys_period)) FILTER (WHERE NOT is_current) OVER entity AS last_history_at,
          bool_or(is_current) OVER entity AS has_current
        FROM snapshots
        WINDOW entity AS (PARTITION BY entity_key)
      ), successor_rows AS MATERIALIZED (
        SELECT DISTINCT ON (entity_key, lower(sys_period))
          entity_key, lower(sys_period) AS starts_at, row_data
        FROM snapshots
        ORDER BY entity_key, lower(sys_period), is_current, row_data
      )
      SELECT
        entity_type,
        change_type,
        id::text AS id,
        update_type,
        ts::text AS timestamp,
        new_row,
        old_row,
        actor_user_id::text AS actor_user_id,
        triggered_by_user_id::text AS triggered_by_user_id,
        workflow_run_id,
        workflow_type,
        action_type,
        request_id,
        group_count::text AS group_count,
        total_count::text AS total_count
      FROM (
        ${aggregate}
      ) temporal_history
      ORDER BY ts DESC NULLS LAST, table_order ASC, stable_id COLLATE "C" ASC
      LIMIT ${resultLimit}
    `,
    parameters,
  );
}
