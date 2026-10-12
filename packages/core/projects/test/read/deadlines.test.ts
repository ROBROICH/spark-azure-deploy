import { describe, expect, test } from "bun:test";

import {
  DeadlineSchema,
  DeadlinesSchema,
  parseErrorContract,
  parseReadContract,
} from "../support/read-contracts.ts";
import { externalTest, readJson } from "../support/external-app.ts";
import { readScenarios } from "../support/read-scenarios.ts";

describe("Project Logic deadline reads", () => {
  externalTest("returns empty retained deadline collections", async () => {
    const [all, project] = await Promise.all([
      readJson("/deadlines"),
      readJson(`/deadlines?projectId=${readScenarios.projects.populated.id}`),
    ]);

    expect([all.status, project.status]).toEqual([200, 200]);
    expect(parseReadContract(DeadlinesSchema, all.body)).toEqual([]);
    expect(parseReadContract(DeadlinesSchema, project.body)).toEqual([]);
  });

  externalTest("rejects an unknown deadline", async () => {
    const response = await readJson(`/deadlines/${readScenarios.deadlines.unknown}`);
    expect(response.status).toBe(404);
    parseErrorContract(response.body);
  });
});

describe("deadline date response contract", () => {
  const baseDeadline = {
    id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380011",
    projectId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380010",
    deadlineType: "Frist",
    legalBasis: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };

  test("accepts date-only startAt and endAt", () => {
    const deadline = parseReadContract(DeadlineSchema, {
      ...baseDeadline,
      startAt: "2026-07-01",
      endAt: "2026-08-31",
    });

    expect(deadline.startAt).toBe("2026-07-01");
    expect(deadline.endAt).toBe("2026-08-31");
  });
});
