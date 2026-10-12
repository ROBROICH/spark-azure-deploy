import { describe, expect } from "bun:test";

import {
  ErrorResponseSchema,
  HistoryExportSchema,
  parseReadContract,
} from "../support/read-contracts.ts";
import { externalTest, readJson } from "../support/external-app.ts";
import { readScenarios } from "../support/read-scenarios.ts";

type QueryValue = number | string;

function exportPath(projectId: string, query: Record<string, QueryValue> = {}): string {
  const search = new URLSearchParams(
    Object.entries(query).map(([key, value]) => [key, String(value)]),
  );
  return `/projects/${projectId}/history/export${search.size === 0 ? "" : `?${search}`}`;
}

async function historyExport(projectId: string, query: Record<string, QueryValue> = {}) {
  return readJson(exportPath(projectId, query));
}

function expectDownloadHeaders(headers: Headers): void {
  expect(headers.get("content-type")).toBe("application/json");
  expect(headers.get("content-disposition")).toBe('attachment; filename="history.json"');
}

describe("GET /projects/{project_id}/history/export HTTP contract", () => {
  externalTest("snapshots an empty genuine JSON attachment", async () => {
    const response = await historyExport(readScenarios.projects.empty);
    const body = parseReadContract(HistoryExportSchema, response.body);

    expect(response.status).toBe(200);
    expectDownloadHeaders(response.headers);
    expect({ status: response.status, body }).toMatchSnapshot();
  });

  externalTest("snapshots the complete ungrouped multi-source export", async () => {
    const response = await historyExport(readScenarios.projects.main);
    const body = parseReadContract(HistoryExportSchema, response.body);

    expect(response.status).toBe(200);
    expectDownloadHeaders(response.headers);
    expect(body.items).toHaveLength(readScenarios.expected.ungroupedTotal);
    expect({ status: response.status, body }).toMatchSnapshot();
  });

  externalTest("snapshots date, source, service, and request filters", async () => {
    const [
      fromResponse,
      toResponse,
      dateResponse,
      sourceResponse,
      serviceResponse,
      requestResponse,
    ] = await Promise.all([
      historyExport(readScenarios.projects.main, { from: readScenarios.dates.inclusiveFrom }),
      historyExport(readScenarios.projects.main, { to: readScenarios.dates.inclusiveTo }),
      historyExport(readScenarios.projects.main, {
        from: readScenarios.dates.inclusiveFrom,
        to: readScenarios.dates.inclusiveTo,
      }),
      historyExport(readScenarios.projects.main, { source: "agent" }),
      historyExport(readScenarios.projects.main, { service: "objections_management" }),
      historyExport(readScenarios.projects.main, { requestId: readScenarios.groups.requestId }),
    ]);
    const from = parseReadContract(HistoryExportSchema, fromResponse.body);
    const to = parseReadContract(HistoryExportSchema, toResponse.body);
    const date = parseReadContract(HistoryExportSchema, dateResponse.body);
    const source = parseReadContract(HistoryExportSchema, sourceResponse.body);
    const service = parseReadContract(HistoryExportSchema, serviceResponse.body);
    const request = parseReadContract(HistoryExportSchema, requestResponse.body);

    for (const response of [
      fromResponse,
      toResponse,
      dateResponse,
      sourceResponse,
      serviceResponse,
      requestResponse,
    ]) {
      expect(response.status).toBe(200);
      expectDownloadHeaders(response.headers);
    }
    expect({ from, to, date, source, service, request }).toMatchSnapshot();
  });

  externalTest("snapshots another project's isolated export", async () => {
    const response = await historyExport(readScenarios.projects.other);
    const body = parseReadContract(HistoryExportSchema, response.body);

    expect(response.status).toBe(200);
    expectDownloadHeaders(response.headers);
    expect(body.items).toHaveLength(1);
    expect({ status: response.status, body }).toMatchSnapshot();
  });

  externalTest(
    "accepts exactly 10,000 parsed items without snapshotting pretty-print bytes",
    async () => {
      const response = await historyExport(readScenarios.projects.bulk, { service: "comment" });
      const body = parseReadContract(HistoryExportSchema, response.body);

      expect(response.status).toBe(200);
      expectDownloadHeaders(response.headers);
      expect(body.total).toBe(readScenarios.expected.bulkBoundary);
      expect(body.items).toHaveLength(readScenarios.expected.bulkBoundary);
      for (let index = 1; index < body.items.length; index += 1) {
        expect(
          Date.parse(body.items[index - 1]!.timestamp) >= Date.parse(body.items[index]!.timestamp),
        ).toBe(true);
      }
      expect({
        projectId: body.projectId,
        total: body.total,
        first: body.items.at(0),
        last: body.items.at(-1),
      }).toMatchSnapshot();
    },
  );

  externalTest("rejects the 10,001-item coordinated export", async () => {
    const response = await historyExport(readScenarios.projects.bulk);
    const body = parseReadContract(ErrorResponseSchema, response.body);

    expect(response.status).toBe(413);
    expect({ status: response.status, body }).toMatchSnapshot();
  });

  externalTest("rejects invalid export dates", async () => {
    const response = await historyExport(readScenarios.projects.main, { from: "not-a-date" });

    expect(response.status).toBe(422);
  });
});
