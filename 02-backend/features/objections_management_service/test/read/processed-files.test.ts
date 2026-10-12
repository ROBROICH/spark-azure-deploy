import { describe, expect } from "bun:test";

import {
  canonicalizeUnorderedProcessedFileIds,
  parseReadContract,
  ProcessedFileIdsSchema,
} from "../support/read-contracts.ts";
import { externalTest, readJson } from "../support/external-app.ts";
import { readScenarios } from "../support/read-scenarios.ts";

const processedPath = (projectId: string, version?: number) =>
  `/${projectId}/ewms/processed-file-ids${
    version === undefined ? "" : `?projectVersion=${version}`
  }`;

describe("GET /{project_id}/ewms/processed-file-ids HTTP contract", () => {
  externalTest("snapshots multiple distinct current files and every excluded state", async () => {
    const scenario = readScenarios;
    const response = await readJson(
      processedPath(scenario.projects.processed.id, scenario.projects.processed.latestVersion),
    );
    const body = canonicalizeUnorderedProcessedFileIds(
      parseReadContract(ProcessedFileIdsSchema, response.body),
    );

    expect(response.status).toBe(200);
    expect(body.fileIds).toEqual([...scenario.processedFiles.current].sort());
    expect(
      body.fileIds.filter((id) => id === scenario.processedFiles.duplicatedAcrossScopes),
    ).toHaveLength(1);
    expect(body.fileIds).not.toContain(scenario.processedFiles.excluded.incomplete);
    expect(body.fileIds).not.toContain(scenario.processedFiles.excluded.failed);
    expect(body.fileIds).not.toContain(scenario.processedFiles.excluded.deleted);
  });

  externalTest("snapshots the explicit historical collection", async () => {
    const scenario = readScenarios;
    const response = await readJson(
      processedPath(scenario.projects.processed.id, scenario.projects.processed.historicalVersion),
    );
    const body = canonicalizeUnorderedProcessedFileIds(
      parseReadContract(ProcessedFileIdsSchema, response.body),
    );

    expect(response.status).toBe(200);
    expect(body.fileIds).toEqual([...scenario.processedFiles.historical].sort());
  });

  externalTest("snapshots an explicit empty collection", async () => {
    const scenario = readScenarios;
    const response = await readJson(
      processedPath(scenario.projects.empty.id, scenario.projects.empty.latestVersion),
    );
    const body = canonicalizeUnorderedProcessedFileIds(
      parseReadContract(ProcessedFileIdsSchema, response.body),
    );

    expect(response.status).toBe(200);
    expect(body.fileIds).toEqual([]);
  });

});
