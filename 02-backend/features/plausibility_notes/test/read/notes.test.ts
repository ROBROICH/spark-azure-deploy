import { describe, expect } from "bun:test";
import type { Static } from "@sinclair/typebox";

import {
  ErrorResponseSchema,
  PlausibilityNotesResponseSchema,
  parseReadContract,
} from "../support/read-contracts.ts";
import { externalTest, readJson } from "../support/external-app.ts";
import { readScenarios } from "../support/read-scenarios.ts";

const canonicalNotes = (body: Static<typeof PlausibilityNotesResponseSchema>) => ({
  contradictions: [...body.contradictions].sort((left, right) => left.id.localeCompare(right.id)),
});

describe("GET /plausibility-notes/{project_id} HTTP contract", () => {
  externalTest("snapshots the retained Testing project's latest notes", async () => {
    const response = await readJson(`/plausibility-notes/${readScenarios.projects.populated.id}`);
    const body = canonicalNotes(parseReadContract(PlausibilityNotesResponseSchema, response.body));

    expect(response.status).toBe(200);
    expect(body.contradictions.map(({ id }) => id)).toEqual(
      [...readScenarios.nodes.currentNotes].sort(),
    );
    expect(body.contradictions.every(({ status }) => status === "IGNORED")).toBeTrue();
    expect({ status: response.status, body }).toMatchSnapshot();
  });

  externalTest("snapshots a latest project with no notes", async () => {
    const response = await readJson(`/plausibility-notes/${readScenarios.projects.empty.id}`);
    const body = parseReadContract(PlausibilityNotesResponseSchema, response.body);

    expect(response.status).toBe(200);
    expect(body.contradictions).toEqual([]);
    expect({ status: response.status, body }).toMatchSnapshot();
  });

  externalTest("returns not found for an unknown project", async () => {
    const response = await readJson(
      `/plausibility-notes/${readScenarios.projects.unknown.id}`,
    );
    const body = parseReadContract(ErrorResponseSchema, response.body);

    expect(response.status).toBe(404);
    expect(body.detail.length).toBeGreaterThan(0);
  });
});
