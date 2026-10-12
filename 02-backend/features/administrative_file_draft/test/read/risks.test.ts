import { describe, expect } from "bun:test";

import {
  ErrorResponseSchema,
  RiskListSchema,
  parseReadContract,
} from "../support/read-contracts.ts";
import { externalTest, readJson } from "../support/external-app.ts";
import { readScenarios } from "../support/read-scenarios.ts";

describe("GET /risks/{project_id} HTTP contract", () => {
  externalTest("snapshots the populated latest version in incumbent database order", async () => {
    const response = await readJson(`/risks/${readScenarios.projects.populated.id}`);
    const body = parseReadContract(RiskListSchema, response.body);

    expect(response.status).toBe(200);
    expect(body.map((risk) => risk.id)).toEqual([
      readScenarios.risks.currentHigh,
      readScenarios.risks.currentLow,
    ]);
    expect(body.map((risk) => risk.severity)).toEqual([3, 1]);
    expect({ status: response.status, body }).toMatchSnapshot();
  });

  externalTest("snapshots an empty latest version", async () => {
    const response = await readJson(`/risks/${readScenarios.projects.empty.id}`);
    const body = parseReadContract(RiskListSchema, response.body);

    expect({ status: response.status, body }).toMatchSnapshot();
  });

  externalTest("reports an unknown project", async () => {
    const response = await readJson(`/risks/${readScenarios.projects.unknown.id}`);
    parseReadContract(ErrorResponseSchema, response.body);

    expect(response.status).toBe(404);
  });
});
