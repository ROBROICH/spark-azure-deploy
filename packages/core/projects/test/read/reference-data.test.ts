import { describe, expect } from "bun:test";

import { externalTest, readJson } from "../support/external-app.ts";
import {
  parseErrorContract,
  parseReadContract,
  ProcessStepsSchema,
  ProjectStatusesSchema,
  ProjectTypesSchema,
} from "../support/read-contracts.ts";
import { readScenarios } from "../support/read-scenarios.ts";

describe("Project Logic reference-data reads", () => {
  externalTest("returns the retained project statuses and project type", async () => {
    const [statuses, types] = await Promise.all([
      readJson("/project-statuses"),
      readJson("/project-types"),
    ]);
    const statusBody = parseReadContract(ProjectStatusesSchema, statuses.body);
    const typeBody = parseReadContract(ProjectTypesSchema, types.body);

    expect(statuses.status).toBe(200);
    expect(statusBody.map(({ internalName }) => internalName).toSorted()).toEqual([
      "COMPLETED",
      "IN_CREATION",
      "IN_PROGRESS",
      "OPEN",
      "UPLOAD_DOCUMENTS",
    ]);
    expect(types.status).toBe(200);
    expect(typeBody.map(({ id }) => id)).toEqual([readScenarios.projectTypes.primary]);
  });

  externalTest("returns empty process-step collections and rejects unknown IDs", async () => {
    const [all, filtered, absent, malformed] = await Promise.all([
      readJson("/process-steps"),
      readJson(`/process-steps?project_type_id=${readScenarios.projectTypes.primary}`),
      readJson(`/process-steps/${readScenarios.projectTypes.unknown}`),
      readJson("/process-steps/not-a-uuid"),
    ]);

    expect(parseReadContract(ProcessStepsSchema, all.body)).toEqual([]);
    expect(parseReadContract(ProcessStepsSchema, filtered.body)).toEqual([]);
    expect([all.status, filtered.status, absent.status, malformed.status]).toEqual([
      200, 200, 404, 422,
    ]);
    parseErrorContract(absent.body);
    parseErrorContract(malformed.body);
  });
});
