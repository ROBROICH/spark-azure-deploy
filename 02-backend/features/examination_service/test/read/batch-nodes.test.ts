import { describe, expect } from "bun:test";

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

const escapeLineBreaksForSnapshot = (results: ({ nodeType: string } & { text?: string })[]) => {
  for (const result of results) {
    if (result.text !== undefined) result.text = result.text.replaceAll("\n", "\\n");
  }
};

async function batch(projectId: string, refs: NodeRef[], version?: number) {
  return readJson(
    `/${projectId}/batch-nodes${version === undefined ? "" : `?projectVersion=${version}`}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ nodes: refs }),
    },
  );
}

describe("POST /{project_id}/batch-nodes HTTP contract", () => {
  externalTest("snapshots an empty explicit request", async () => {
    const response = await batch(
      readScenarios.projects.populated.id,
      [],
      readScenarios.projects.populated.latestVersion,
    );
    const body = parseReadContract(BatchNodesResponseSchema, response.body);

    expect(response.status).toBe(200);
    expect(body.results).toEqual([]);
    expect({ status: response.status, body }).toMatchSnapshot();
  });

  externalTest(
    "freezes mixed-type grouping, full fields, duplicate collapse, and unknown/deleted omission",
    async () => {
      const refs: NodeRef[] = [
        { nodeType: "norm", id: readScenarios.nodes.versionedNorm },
        { nodeType: "norm", id: readScenarios.nodes.unknownNorm },
        { nodeType: "gesetz", id: readScenarios.nodes.law },
        { nodeType: "norm", id: readScenarios.nodes.deletedNorm },
        { nodeType: "norm", id: readScenarios.nodes.versionedNorm },
      ];
      const response = await batch(
        readScenarios.projects.populated.id,
        refs,
        readScenarios.projects.populated.latestVersion,
      );
      const body = parseReadContract(BatchNodesResponseSchema, response.body);

      expect(body.results.map(({ id }) => id)).toEqual([
        readScenarios.nodes.versionedNorm,
        readScenarios.nodes.law,
      ]);
      escapeLineBreaksForSnapshot(body.results);
      expect({ requested: refs, status: response.status, body }).toMatchSnapshot();
    },
  );

  externalTest("omitted version returns the current-only full payload", async () => {
    const refs: NodeRef[] = [
      { nodeType: "norm", id: readScenarios.nodes.currentOnlyNorm },
      { nodeType: "gesetz", id: readScenarios.nodes.law },
    ];
    const explicit = await batch(
      readScenarios.projects.populated.id,
      refs,
      readScenarios.projects.populated.latestVersion,
    );
    const explicitBody = parseReadContract(BatchNodesResponseSchema, explicit.body);
    const implicit = await batch(readScenarios.projects.populated.id, refs);
    const implicitBody = parseReadContract(BatchNodesResponseSchema, implicit.body);

    expect(implicitBody).toEqual(explicitBody);
    escapeLineBreaksForSnapshot(implicitBody.results);
    expect({ status: implicit.status, body: implicitBody }).toMatchSnapshot();
  });

  for (const [name, projectId] of [
    ["unknown project", readScenarios.projects.unknown.id],
    ["missing latest version", readScenarios.projects.missingVersion.id],
    ["upstream failure", readScenarios.projects.upstreamFailure.id],
  ] as const) {
    externalTest(`returns 500 for ${name} during omitted-version lookup`, async () => {
      const response = await batch(projectId, []);
      parseReadContract(ErrorResponseSchema, response.body);

      expect(response.status).toBe(500);
    });
  }
});
