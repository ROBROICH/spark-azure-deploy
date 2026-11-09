import { describe, expect, test } from "bun:test";
import type { PostgresScope } from "@spark-workflow/postgres-runtime";

import type { HistoryQuery } from "../src/history/types.ts";
import { readHistory } from "../src/routes/read-history.ts";

const query: HistoryQuery = {
  projectId: "71000000-0000-4000-8000-000000000001",
  from: null,
  to: null,
  source: null,
  service: "comment",
  workflowRunId: null,
  requestId: null,
  collapsed: false,
  limit: 50,
  offset: 0,
};

const commentRow = (text: string) => ({
  id: "79000000-0000-4000-8000-000000000001",
  project_id: query.projectId,
  text,
  attachments: [{ name: "plan.pdf" }],
  sys_period: '["2026-02-01 08:00:00+00","2026-02-01 09:00:00+00")',
});

const updateRow = {
  entity_type: "comment",
  change_type: "update",
  id: "79000000-0000-4000-8000-000000000001",
  update_type: null,
  timestamp: "2026-02-01 09:00:00+00",
  new_row: commentRow("nachher"),
  old_row: commentRow("vorher"),
  actor_user_id: "74000000-0000-4000-8000-000000000001",
  triggered_by_user_id: null,
  workflow_run_id: null,
  workflow_type: null,
  action_type: null,
  request_id: null,
  group_count: "1",
  total_count: "1",
};

const rowsScope: PostgresScope<{}> = {
  query: async () => [updateRow] as never,
  streamRows: async function* () {
    yield* [];
  },
  transact: async (callback) => callback(),
};

describe("readHistory", () => {
  test("keeps every row column except the temporal bookkeeping", async () => {
    const [item] = (await readHistory(rowsScope, query)).unwrap().items;
    const { sys_period: _period, ...expected } = commentRow("vorher");

    expect(item?.oldRow).toEqual(expected);
    expect(item?.newRow).toEqual({ ...expected, text: "nachher" });
  });
});
