import { describe, expect } from "bun:test";
import type { Static } from "@sinclair/typebox";

import {
  ErrorResponseSchema,
  NodeListSchema,
  parseReadContract,
} from "../support/read-contracts.ts";
import { externalTest, readJson } from "../support/external-app.ts";
import { readScenarios } from "../support/read-scenarios.ts";

// The incumbent UNION-backed stream has no ORDER BY. Canonicalize only this unordered
// collection (and its metadata-derived parent set) after complete TypeBox parsing.
const canonicalNodeList = (body: Static<typeof NodeListSchema>) => ({
  nodes: body.nodes
    .map((node) => ({
      ...node,
      parents: [...node.parents].sort((left, right) =>
        `${left.nodeType}:${left.id}`.localeCompare(`${right.nodeType}:${right.id}`),
      ),
    }))
    .sort((left, right) =>
      `${left.nodeType}:${left.id}`.localeCompare(`${right.nodeType}:${right.id}`),
    ),
});

const nodes = async (projectId: string, version?: number) => {
  return readJson(
    `/${projectId}/nodes${version === undefined ? "" : `?projectVersion=${version}`}`,
  );
};

describe("GET /{project_id}/nodes HTTP contract", () => {
  externalTest("snapshots the retained Testing project's current nodes", async () => {
    const response = await nodes(
      readScenarios.projects.populated.id,
      readScenarios.projects.populated.latestVersion,
    );
    const body = canonicalNodeList(parseReadContract(NodeListSchema, response.body));

    expect(new Set(body.nodes.map(({ nodeType }) => nodeType))).toEqual(
      new Set(["plausibility_note"]),
    );
    expect(body.nodes.map(({ id }) => id)).toEqual([...readScenarios.nodes.currentNotes].sort());
    expect({ status: response.status, body }).toMatchSnapshot();
  });

  externalTest("snapshots explicit historical and empty versions", async () => {
    const [historical, empty] = await Promise.all([
      nodes(
        readScenarios.projects.populated.id,
        readScenarios.projects.populated.historicalVersion,
      ),
      nodes(readScenarios.projects.empty.id, 1),
    ]);
    const payload = {
      historical: {
        status: historical.status,
        body: canonicalNodeList(parseReadContract(NodeListSchema, historical.body)),
      },
      empty: {
        status: empty.status,
        body: canonicalNodeList(parseReadContract(NodeListSchema, empty.body)),
      },
    };

    expect(new Set(payload.historical.body.nodes.map(({ nodeType }) => nodeType))).toEqual(
      new Set(["plausibility_note", "plausibility_note_occurrence"]),
    );
    expect(
      payload.historical.body.nodes.find(
        ({ id }) => id === readScenarios.nodes.historicalOccurrence.id,
      )?.parents,
    ).toEqual([
      { id: readScenarios.nodes.historicalOccurrence.documentId, nodeType: "file" },
      { id: readScenarios.nodes.historicalOccurrence.noteId, nodeType: "plausibility_note" },
    ]);
    expect(payload.empty.body.nodes).toEqual([]);
    expect(payload).toMatchSnapshot();
  });

  externalTest(
    "omitted version resolves to the same current payload through core Projects",
    async () => {
      const explicit = await nodes(
        readScenarios.projects.populated.id,
        readScenarios.projects.populated.latestVersion,
      );
      const explicitBody = canonicalNodeList(parseReadContract(NodeListSchema, explicit.body));
      const implicit = await nodes(readScenarios.projects.populated.id);
      const implicitBody = canonicalNodeList(parseReadContract(NodeListSchema, implicit.body));

      expect(implicitBody).toEqual(explicitBody);
      expect({ status: implicit.status, body: implicitBody }).toMatchSnapshot();
    },
  );

  externalTest("returns an error for an unknown project when version is omitted", async () => {
    const response = await nodes(readScenarios.projects.unknown.id);
    const body = parseReadContract(ErrorResponseSchema, response.body);

    expect(response.status).toBe(500);
    expect(body.detail.length).toBeGreaterThan(0);
  });
});
