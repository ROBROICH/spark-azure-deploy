import { describe, expect } from "bun:test";

import { HistoryResponseSchema, parseReadContract } from "../support/read-contracts.ts";
import { externalTest, readJson } from "../support/external-app.ts";
import { readScenarios } from "../support/read-scenarios.ts";

type QueryValue = boolean | number | string;

function historyPath(projectId: string, query: Record<string, QueryValue> = {}): string {
  const search = new URLSearchParams(
    Object.entries(query).map(([key, value]) => [key, String(value)]),
  );
  return `/projects/${projectId}/history${search.size === 0 ? "" : `?${search}`}`;
}

async function history(
  projectId: string,
  query: Record<string, QueryValue> = {},
  init?: RequestInit,
) {
  return readJson(historyPath(projectId, query), init);
}

describe("GET /projects/{project_id}/history HTTP contract", () => {
  externalTest(
    "snapshots an empty project while disabled auth ignores malformed credentials",
    async () => {
      const response = await history(
        readScenarios.projects.empty,
        {},
        {
          headers: {
            authorization: "Bearer deliberately-unverifiable",
            "x-forwarded-client-cert": "not-a-certificate",
          },
        },
      );
      const body = parseReadContract(HistoryResponseSchema, response.body);

      expect(response.status).toBe(200);
      expect({ status: response.status, body }).toMatchSnapshot();
    },
  );

  externalTest(
    "snapshots default cross-database workflow/request collapse and attribution",
    async () => {
      const response = await history(readScenarios.projects.main);
      const body = parseReadContract(HistoryResponseSchema, response.body);

      expect(response.status).toBe(200);
      expect(body.total).toBe(readScenarios.expected.collapsedItems);
      expect(body.items).toHaveLength(readScenarios.expected.collapsedItems);
      expect({ status: response.status, body }).toMatchSnapshot();
    },
  );

  externalTest(
    "snapshots the full ungrouped timeline and deterministic cross-database ties",
    async () => {
      const response = await history(readScenarios.projects.main, { ungrouped: true });
      const body = parseReadContract(HistoryResponseSchema, response.body);

      expect(response.status).toBe(200);
      expect(body.items).toHaveLength(readScenarios.expected.ungroupedTotal);
      const requestTie = body.items
        .filter((item) => item.requestId === readScenarios.groups.requestId)
        .map((item) => item.service);
      const workflowTie = body.items
        .filter((item) => item.workflowRunId === readScenarios.groups.workflowRunId)
        .map((item) => item.service);
      expect(requestTie).toEqual(readScenarios.expected.requestTieOrder);
      expect(workflowTie).toEqual(readScenarios.expected.workflowTieOrder);
      expect({ status: response.status, body }).toMatchSnapshot();
    },
  );

  externalTest("workflow and request drill-down each imply ungrouped output", async () => {
    const [workflowResponse, requestResponse] = await Promise.all([
      history(readScenarios.projects.main, {
        workflowRunId: readScenarios.groups.workflowRunId,
      }),
      history(readScenarios.projects.main, { requestId: readScenarios.groups.requestId }),
    ]);
    const workflow = parseReadContract(HistoryResponseSchema, workflowResponse.body);
    const request = parseReadContract(HistoryResponseSchema, requestResponse.body);

    expect(workflowResponse.status).toBe(200);
    expect(requestResponse.status).toBe(200);
    expect(workflow.items).toHaveLength(readScenarios.expected.workflowItems);
    expect(request.items).toHaveLength(readScenarios.expected.requestItems);
    expect({ workflow, request }).toMatchSnapshot();
  });

  externalTest("snapshots user, agent, and all source classification", async () => {
    const [userResponse, agentResponse, allResponse] = await Promise.all([
      history(readScenarios.projects.main, { source: "user", ungrouped: true }),
      history(readScenarios.projects.main, { source: "agent", ungrouped: true }),
      history(readScenarios.projects.main, { source: "all", ungrouped: true }),
    ]);
    const user = parseReadContract(HistoryResponseSchema, userResponse.body);
    const agent = parseReadContract(HistoryResponseSchema, agentResponse.body);
    const all = parseReadContract(HistoryResponseSchema, allResponse.body);

    expect([userResponse.status, agentResponse.status, allResponse.status]).toEqual([
      200, 200, 200,
    ]);
    expect(user.items).toHaveLength(readScenarios.expected.userItems);
    expect(agent.items).toHaveLength(readScenarios.expected.agentItems);
    expect(all.items).toHaveLength(readScenarios.expected.ungroupedTotal);
    expect({ user, agent, all }).toMatchSnapshot();
  });

  externalTest(
    "snapshots from-only, to-only, and inclusive date filtering before collapse",
    async () => {
      const [fromResponse, toResponse, rangeResponse] = await Promise.all([
        history(readScenarios.projects.main, { from: readScenarios.dates.inclusiveFrom }),
        history(readScenarios.projects.main, { to: readScenarios.dates.inclusiveTo }),
        history(readScenarios.projects.main, {
          from: readScenarios.dates.inclusiveFrom,
          to: readScenarios.dates.inclusiveTo,
        }),
      ]);
      const from = parseReadContract(HistoryResponseSchema, fromResponse.body);
      const to = parseReadContract(HistoryResponseSchema, toResponse.body);
      const range = parseReadContract(HistoryResponseSchema, rangeResponse.body);

      expect([fromResponse.status, toResponse.status, rangeResponse.status]).toEqual([
        200, 200, 200,
      ]);
      expect(range.total).toBe(readScenarios.expected.dateFilteredCollapsedItems);
      expect(range.items).toHaveLength(readScenarios.expected.dateFilteredCollapsedItems);
      expect({ from, to, range }).toMatchSnapshot();
    },
  );

  externalTest("service and combined service/source/request filters remain exact", async () => {
    const [serviceResponse, combinedResponse, unknownResponse] = await Promise.all([
      history(readScenarios.projects.main, { service: "formal_completeness", ungrouped: true }),
      history(readScenarios.projects.main, {
        service: "formal_completeness",
        source: "user",
        requestId: readScenarios.groups.requestId,
      }),
      history(readScenarios.projects.main, { service: "not_configured" }),
    ]);
    const service = parseReadContract(HistoryResponseSchema, serviceResponse.body);
    const combined = parseReadContract(HistoryResponseSchema, combinedResponse.body);
    const unknown = parseReadContract(HistoryResponseSchema, unknownResponse.body);

    expect([serviceResponse.status, combinedResponse.status, unknownResponse.status]).toEqual([
      200, 200, 200,
    ]);
    expect({ service, combined, unknown }).toMatchSnapshot();
  });

  externalTest("another project is isolated from the main and empty projects", async () => {
    const response = await history(readScenarios.projects.other, { ungrouped: true });
    const body = parseReadContract(HistoryResponseSchema, response.body);

    expect(response.status).toBe(200);
    expect(body.items).toHaveLength(1);
    expect({ status: response.status, body }).toMatchSnapshot();
  });

  externalTest("snapshots first, middle, and empty collapsed pages", async () => {
    const [firstResponse, middleResponse, emptyResponse] = await Promise.all([
      history(readScenarios.projects.main, { limit: 2, offset: 0 }),
      history(readScenarios.projects.main, { limit: 2, offset: 2 }),
      history(readScenarios.projects.main, { limit: 2, offset: 6 }),
    ]);
    const first = parseReadContract(HistoryResponseSchema, firstResponse.body);
    const middle = parseReadContract(HistoryResponseSchema, middleResponse.body);
    const empty = parseReadContract(HistoryResponseSchema, emptyResponse.body);

    expect([firstResponse.status, middleResponse.status, emptyResponse.status]).toEqual([
      200, 200, 200,
    ]);
    expect({ first, middle, empty }).toMatchSnapshot();
  });

  externalTest("accepts both limit boundaries", async () => {
    const [minimumResponse, maximumResponse] = await Promise.all([
      history(readScenarios.projects.main, { limit: 1 }),
      history(readScenarios.projects.main, { limit: 500 }),
    ]);
    const minimum = parseReadContract(HistoryResponseSchema, minimumResponse.body);
    const maximum = parseReadContract(HistoryResponseSchema, maximumResponse.body);

    expect([minimumResponse.status, maximumResponse.status]).toEqual([200, 200]);
    expect({ minimum, maximum }).toMatchSnapshot();
  });

  externalTest("rejects invalid limit, offset, and source values", async () => {
    const responses = await Promise.all([
      history(readScenarios.projects.main, { limit: 0 }),
      history(readScenarios.projects.main, { limit: 501 }),
      history(readScenarios.projects.main, { offset: -1 }),
      history(readScenarios.projects.main, { offset: 10_001 }),
      history(readScenarios.projects.main, { source: "unknown" }),
    ]);
    expect(responses.map((response) => response.status)).toEqual([422, 422, 422, 422, 422]);
  });

  externalTest("rejects invalid from and to dates", async () => {
    const [fromResponse, toResponse] = await Promise.all([
      history(readScenarios.projects.main, { from: "not-a-date" }),
      history(readScenarios.projects.main, { to: "still-not-a-date" }),
    ]);
    expect([fromResponse.status, toResponse.status]).toEqual([422, 422]);
  });
});
