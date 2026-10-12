import { describe, expect } from "bun:test";

import {
  ErrorResponseSchema,
  FppRequestDetailSchema,
  parseReadContract,
} from "../support/read-contracts.ts";
import { externalTest, readJson } from "../support/external-app.ts";
import { readScenarios } from "../support/read-scenarios.ts";

const foundScenarioNames = [
  "received-empty",
  "imported-one-file",
  "imported-many-files",
  "failed-one-file",
] as const;

describe("GET /internal/fpp/requests/{request_id} HTTP contract", () => {
  externalTest("snapshots zero, one, and many files across every request status", async () => {
    const entries = await Promise.all(
      foundScenarioNames.map(async (name) => {
        const scenario = readScenarios[name];
        const response = await readJson(`/internal/fpp/requests/${scenario.request.requestId}`);
        return [
          name,
          {
            status: response.status,
            body: parseReadContract(FppRequestDetailSchema, response.body),
          },
        ] as const;
      }),
    );

    for (const [name, result] of entries) {
      const scenario = readScenarios[name];
      expect(result.status).toBe(200);
      expect(result.body.requestId).toBe(scenario.request.requestId);
      expect(result.body.status).toBe(scenario.request.status);
      expect(result.body.projectId).toBe(scenario.request.projectId);
      expect(result.body.files.map((file) => file.id)).toEqual(
        scenario.files.map((file) => file.id),
      );
      result.body.xml = result.body.xml.replaceAll("\n", "\\n");
    }

    expect(Object.fromEntries(entries)).toMatchSnapshot();
  });

  externalTest("snapshots the absent request error", async () => {
    const scenario = readScenarios["absent-request"];
    const response = await readJson(`/internal/fpp/requests/${scenario.requestId}`);
    const body = parseReadContract(ErrorResponseSchema, response.body);

    expect(response.status).toBe(404);
    expect(body.detail).toBe(`Request ${scenario.requestId} not found`);
    expect({ status: response.status, body }).toMatchSnapshot();
  });
});
