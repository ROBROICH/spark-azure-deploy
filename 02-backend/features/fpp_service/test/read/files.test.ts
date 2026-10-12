import { describe, expect } from "bun:test";

import {
  ErrorResponseSchema,
  FppFileListSchema,
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

describe("GET /internal/fpp/files/{request_id} HTTP contract", () => {
  externalTest("snapshots empty, one, and many file projections in incumbent order", async () => {
    const entries = await Promise.all(
      foundScenarioNames.map(async (name) => {
        const scenario = readScenarios[name];
        const response = await readJson(`/internal/fpp/files/${scenario.request.requestId}`);
        return [
          name,
          {
            status: response.status,
            body: parseReadContract(FppFileListSchema, response.body),
          },
        ] as const;
      }),
    );

    for (const [name, result] of entries) {
      const scenario = readScenarios[name];
      expect(result.status).toBe(200);
      expect(result.body.map((file) => file.id)).toEqual(scenario.files.map((file) => file.id));
    }

    const many = Object.fromEntries(entries)["imported-many-files"]!.body;
    expect(many.map((file) => file.id)).not.toContain(
      readScenarios["cross-request-exclusion"].excludedFileId,
    );
    expect(
      many.map((file) => {
        const fixture = readScenarios["imported-many-files"].files.find(
          (candidate) => candidate.id === file.id,
        )!;
        return { id: file.id, downloaded: fixture.downloaded, dmsFileId: fixture.dmsFileId };
      }),
    ).toEqual([
      {
        id: "0ed8efc7-2220-47a9-897f-171aaa8177c2",
        downloaded: false,
        dmsFileId: null,
      },
      {
        id: "c7dede93-2c8c-4631-b06c-7a25f1cfce0b",
        downloaded: true,
        dmsFileId: "8b48386b-ecf3-4967-9a3a-92bd99587bf4",
      },
    ]);

    expect(Object.fromEntries(entries)).toMatchSnapshot();
  });

  externalTest("snapshots the absent request error", async () => {
    const scenario = readScenarios["absent-request"];
    const response = await readJson(`/internal/fpp/files/${scenario.requestId}`);
    const body = parseReadContract(ErrorResponseSchema, response.body);

    expect(response.status).toBe(404);
    expect(body.detail).toBe(`Request ${scenario.requestId} not found`);
    expect({ status: response.status, body }).toMatchSnapshot();
  });
});
