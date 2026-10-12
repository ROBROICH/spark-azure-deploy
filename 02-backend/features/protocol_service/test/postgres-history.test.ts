import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createPostgresRuntime, type PostgresResourceRuntime } from "@spark-workflow/postgres-runtime";
import { sql } from "drizzle-orm";

import type { HistoryQuery } from "../src/history/types.ts";
import { readHistory } from "../src/routes/read-history.ts";
import { protocolSourceDefinitions } from "../src/sources.ts";

const databaseUrl = process.env.POSTGRES_RUNTIME_TEST_URL;
const realPostgres = databaseUrl ? describe : describe.skip;
const projectId = "71000000-0000-4000-8000-000000000001";

const query = (overrides: Partial<HistoryQuery> = {}): HistoryQuery => ({
  projectId,
  from: null,
  to: null,
  source: null,
  service: null,
  workflowRunId: null,
  requestId: null,
  collapsed: false,
  limit: 50,
  offset: 0,
  ...overrides,
});

realPostgres("aggregate Protocol history", () => {
  let runtime: PostgresResourceRuntime<{}>;

  beforeAll(async () => {
    runtime = createPostgresRuntime({
      url: databaseUrl!,
      schema: {},
      pool: {
        maxConnections: 1,
        idleTimeoutSeconds: 5,
        connectionTimeoutSeconds: 5,
        maxLifetimeSeconds: 60,
        closeTimeoutSeconds: 5,
      },
    });
    await runtime.query((database) =>
      database.execute(
        sql.raw(`
        CREATE TEMP TABLE audit_log (
          id uuid PRIMARY KEY,
          project_id uuid,
          entity_id uuid,
          entity_type text NOT NULL,
          change_type text NOT NULL,
          timestamp timestamptz NOT NULL,
          request_start_time timestamptz,
          actor_user_id uuid,
          triggered_by_user_id uuid,
          workflow_run_id text,
          workflow_type text,
          action_type text,
          request_id text
        )
      `),
      ),
    );
    for (const { tables } of protocolSourceDefinitions) {
      for (const { name } of tables) {
        for (const table of [name, `${name}_history`]) {
          await runtime.query((database) =>
            database.execute(
              sql.raw(`
                CREATE TEMP TABLE "${table}" (
                  id uuid NOT NULL,
                  project_id uuid,
                  update_type text,
                  project_version integer,
                  sys_period tstzrange NOT NULL
                )
              `),
            ),
          );
        }
      }
    }
  });

  afterAll(() => runtime.close());

  test("applies date filters to physical temporal columns", async () => {
    for (const range of [
      { from: "2026-01-01T00:00:00Z" },
      { to: "2026-01-02T00:00:00Z" },
      { from: "2026-01-01T00:00:00Z", to: "2026-01-02T00:00:00Z" },
    ]) {
      const result = await readHistory(runtime, query({ service: "comment", ...range }));
      if (result.isErr()) throw result.error;
      expect(result.value.items).toEqual([]);
    }
  });

  test("attributes one global action to its owning source", async () => {
    await runtime.query((database) =>
      database.execute(sql`
        INSERT INTO audit_log (
          id,
          project_id,
          entity_id,
          entity_type,
          change_type,
          timestamp,
          actor_user_id,
          action_type
        ) VALUES (
          ${"72000000-0000-4000-8000-000000000001"}::uuid,
          ${projectId}::uuid,
          ${"73000000-0000-4000-8000-000000000001"}::uuid,
          'project',
          'action',
          '2026-01-01T10:00:00Z'::timestamptz,
          ${"74000000-0000-4000-8000-000000000001"}::uuid,
          'project-reviewed'
        )
      `),
    );

    const result = await readHistory(runtime, query());
    if (result.isErr()) throw result.error;
    expect(result.value.total).toBe(1);
    expect(result.value.items).toEqual([
      expect.objectContaining({
        entityType: "project",
        service: "project_logic",
        changeType: "action",
        actionType: "project-reviewed",
      }),
    ]);

    const unrelated = await readHistory(runtime, query({ service: "comment" }));
    if (unrelated.isErr()) throw unrelated.error;
    expect(unrelated.value.total).toBe(0);
  });
  test("keeps equal-time pages complete across source tables", async () => {
    const ids = ["f0000000-0000-4000-8000-000000000001", "10000000-0000-4000-8000-000000000001"];
    for (const [index, table] of ["gesetz", "norm"].entries()) {
      await runtime.query((database) =>
        database.execute(
          sql.raw(`
        INSERT INTO "${table}" (id, project_id, project_version, sys_period)
        VALUES ('${ids[index]}', '${projectId}', 1, '[2026-02-01 10:00:00+00,)')
      `),
        ),
      );
    }
    const full = (await readHistory(runtime, query({ service: "examination" }))).unwrap();
    const first = (
      await readHistory(runtime, query({ service: "examination", limit: 1 }))
    ).unwrap();
    const second = (
      await readHistory(runtime, query({ service: "examination", limit: 1, offset: 1 }))
    ).unwrap();
    expect([...first.items, ...second.items]).toEqual(full.items);
    expect(new Set(full.items.map((item) => item.entityId)).size).toBe(2);
  });

  test("does not let another project's same ID suppress a creation event", async () => {
    const id = "75000000-0000-4000-8000-000000000001";
    await runtime.query((database) =>
      database.execute(sql`
      INSERT INTO comment (id, project_id, project_version, sys_period)
      VALUES (${id}::uuid, ${projectId}::uuid, 1, '[2026-03-01 10:00:00+00,)')
    `),
    );
    const before = (await readHistory(runtime, query({ service: "comment" }))).unwrap();
    await runtime.query((database) =>
      database.execute(sql`
      INSERT INTO comment_history (id, project_id, project_version, sys_period)
      VALUES (${id}::uuid, ${"71000000-0000-4000-8000-000000000002"}::uuid, 2,
        '[2026-03-01 08:00:00+00,2026-03-01 09:00:00+00)')
    `),
    );
    expect((await readHistory(runtime, query({ service: "comment" }))).unwrap()).toEqual(before);
  });

  test("groups complete workflow events before pagination and counts rendered groups", async () => {
    for (const [index, type, timestamp, workflow] of [
      [1, "comment", "2026-04-01T10:00:00Z", "shared-workflow"],
      [2, "supplementary_request", "2026-04-01T09:00:00Z", null],
      [3, "supplementary_request", "2026-04-01T08:00:00Z", "shared-workflow"],
    ] as const) {
      await runtime.query((database) =>
        database.execute(sql`
        INSERT INTO audit_log (id, project_id, entity_type, change_type, timestamp, workflow_run_id)
        VALUES (${"76000000-0000-4000-8000-00000000000" + index}::uuid, ${projectId}::uuid,
          ${type}, 'action', ${timestamp}::timestamptz, ${workflow})
      `),
      );
    }
    const options = { collapsed: true, from: "2026-04-01T00:00:00Z" };
    const full = (await readHistory(runtime, query(options))).unwrap();
    const first = (await readHistory(runtime, query({ ...options, limit: 1 }))).unwrap();
    const second = (
      await readHistory(runtime, query({ ...options, limit: 1, offset: 1 }))
    ).unwrap();
    expect([...first.items, ...second.items]).toEqual(full.items);
    expect(full.total).toBe(2);
    expect(full.items.map((item) => item.groupCount)).toEqual([1, 2]);
  });

  test("keeps distinct versions separate and filters by the displayed audit time", async () => {
    const id = "77000000-0000-4000-8000-000000000001";
    await runtime.query((database) =>
      database.execute(sql`
      INSERT INTO comment (id, project_id, project_version, sys_period)
      VALUES (${id}::uuid, ${projectId}::uuid, 2, '[2026-05-01 10:00:00+00,)');
    `),
    );
    await runtime.query((database) =>
      database.execute(sql`
      INSERT INTO comment_history (id, project_id, project_version, sys_period)
      VALUES (${id}::uuid, ${projectId}::uuid, 1, '[2026-05-01 08:00:00+00,2026-05-01 09:00:00+00)');
    `),
    );
    const history = (
      await readHistory(runtime, query({ service: "comment", from: "2026-05-01T00:00:00Z" }))
    ).unwrap();
    expect(history.items.map(({ changeType, timestamp }) => ({ changeType, timestamp }))).toEqual([
      { changeType: "create", timestamp: "2026-05-01T10:00:00Z" },
      { changeType: "delete", timestamp: "2026-05-01T09:00:00Z" },
      { changeType: "create", timestamp: "2026-05-01T08:00:00Z" },
    ]);
    await runtime.query((database) =>
      database.execute(sql`
      INSERT INTO comment_history (id, project_id, project_version, sys_period)
      VALUES (${id}::uuid, ${projectId}::uuid, 1, '[2026-05-01 09:00:00+00,2026-05-01 09:30:00+00)');
    `),
    );
    const withSuccessor = (
      await readHistory(runtime, query({ service: "comment", from: "2026-05-01T00:00:00Z" }))
    ).unwrap();
    expect(
      withSuccessor.items.map(({ changeType, timestamp }) => ({ changeType, timestamp })),
    ).toEqual([
      { changeType: "create", timestamp: "2026-05-01T10:00:00Z" },
      { changeType: "delete", timestamp: "2026-05-01T09:30:00Z" },
      { changeType: "update", timestamp: "2026-05-01T09:00:00Z" },
      { changeType: "create", timestamp: "2026-05-01T08:00:00Z" },
    ]);
    await runtime.query((database) =>
      database.execute(sql`
      INSERT INTO audit_log (id, project_id, entity_type, change_type, timestamp, request_start_time)
      VALUES ('78000000-0000-4000-8000-000000000001', ${projectId}::uuid, 'comment', 'action',
        '2026-06-02T10:00:00Z', '2026-06-01T10:00:00.123456Z');
    `),
    );
    const filtered = (
      await readHistory(
        runtime,
        query({ service: "comment", from: "2026-06-01T00:00:00Z", to: "2026-06-01T23:59:59Z" }),
      )
    ).unwrap();
    expect(filtered.items.map(({ timestamp }) => timestamp)).toEqual([
      "2026-06-01T10:00:00.123456Z",
    ]);
  });
});
