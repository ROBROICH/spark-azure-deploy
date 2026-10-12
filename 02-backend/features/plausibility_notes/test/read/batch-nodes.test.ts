import { describe, expect } from "bun:test";
import type { Static } from "@sinclair/typebox";

import {
  BatchNodesResponseSchema,
  ErrorResponseSchema,
  type NodeType,
  parseReadContract,
} from "../support/read-contracts.ts";
import { externalTest, readJson } from "../support/external-app.ts";
import { readScenarios } from "../support/read-scenarios.ts";

interface NodeRef {
  nodeType: NodeType;
  id: string;
}

// Incumbent batch lookup groups references into sets and emits an unordered SQL UNION.
// Preserve complete payloads while treating only its top-level results as a semantic set.
const canonicalBatch = (body: Static<typeof BatchNodesResponseSchema>) => {
  for (const result of body.results) {
    result.createdAt = new Date(result.createdAt).toISOString();
    result.updatedAt = new Date(result.updatedAt).toISOString();
  }
  body.results.sort((left, right) =>
    `${left.nodeType}:${left.id}`.localeCompare(`${right.nodeType}:${right.id}`),
  );
  return body;
};

const batch = async (projectId: string, refs: NodeRef[], version?: number) => {
  return readJson(
    `/${projectId}/batch-nodes${version === undefined ? "" : `?projectVersion=${version}`}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ nodes: refs }),
    },
  );
};

describe("POST /{project_id}/batch-nodes HTTP contract", () => {
  externalTest("snapshots an empty request", async () => {
    const response = await batch(
      readScenarios.projects.populated.id,
      [],
      readScenarios.projects.populated.latestVersion,
    );
    const body = canonicalBatch(parseReadContract(BatchNodesResponseSchema, response.body));

    expect({ status: response.status, body }).toMatchSnapshot();
  });

  externalTest(
    "freezes current Testing payloads and set semantics for unknown and duplicate IDs",
    async () => {
      const refs: NodeRef[] = [
        { nodeType: "plausibility_note", id: readScenarios.nodes.unknown },
        { nodeType: "plausibility_note", id: readScenarios.nodes.currentNotes[0]! },
        { nodeType: "plausibility_note", id: readScenarios.nodes.currentNotes[0]! },
        { nodeType: "plausibility_note", id: readScenarios.nodes.currentNotes[1]! },
      ];
      const response = await batch(
        readScenarios.projects.populated.id,
        refs,
        readScenarios.projects.populated.latestVersion,
      );
      const body = canonicalBatch(parseReadContract(BatchNodesResponseSchema, response.body));

      expect(body.results.map(({ id }) => id)).toEqual([
        readScenarios.nodes.currentNotes[0],
        readScenarios.nodes.currentNotes[1],
      ]);
      expect({ requested: refs, status: response.status, body }).toMatchSnapshot();
    },
  );

  externalTest("snapshots explicit historical full payloads", async () => {
    const response = await batch(
      readScenarios.projects.populated.id,
      [
        { nodeType: "plausibility_note", id: readScenarios.nodes.currentNotes[0]! },
        {
          nodeType: "plausibility_note_occurrence",
          id: readScenarios.nodes.historicalOccurrence.id,
        },
      ],
      readScenarios.projects.populated.historicalVersion,
    );
    const body = canonicalBatch(parseReadContract(BatchNodesResponseSchema, response.body));

    expect({ status: response.status, body }).toMatchSnapshot();
  });

  externalTest("omitted version resolves to the same current full payload", async () => {
    const refs: NodeRef[] = [
      { nodeType: "plausibility_note", id: readScenarios.nodes.currentNotes[0]! },
      { nodeType: "plausibility_note", id: readScenarios.nodes.currentNotes[1]! },
    ];
    const explicit = await batch(
      readScenarios.projects.populated.id,
      refs,
      readScenarios.projects.populated.latestVersion,
    );
    const explicitBody = canonicalBatch(parseReadContract(BatchNodesResponseSchema, explicit.body));
    const implicit = await batch(readScenarios.projects.populated.id, refs);
    const implicitBody = canonicalBatch(parseReadContract(BatchNodesResponseSchema, implicit.body));

    expect(implicitBody).toEqual(explicitBody);
    expect({ status: implicit.status, body: implicitBody }).toMatchSnapshot();
  });

  externalTest("returns an error for an unknown project when version is omitted", async () => {
    const response = await batch(readScenarios.projects.unknown.id, []);
    const body = parseReadContract(ErrorResponseSchema, response.body);

    expect(response.status).toBe(500);
    expect(body.detail.length).toBeGreaterThan(0);
  });
});
