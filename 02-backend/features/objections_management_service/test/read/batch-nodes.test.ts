import { describe, expect } from "bun:test";

import { BatchNodesResponseSchema, parseReadContract } from "../support/read-contracts.ts";
import { externalTest, readJson } from "../support/external-app.ts";
import { readScenarios } from "../support/read-scenarios.ts";

type NodeType = "argument" | "beteiligungs_eingang" | "beteiligungs_eingang_markdown";
interface NodeRef {
  nodeType: NodeType;
  id: string;
}

const batch = (projectId: string, nodes: NodeRef[], version?: number) =>
  readJson(
    `/${projectId}/batch-nodes${version === undefined ? "" : `?projectVersion=${version}`}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ nodes }),
    },
  );

describe("POST /{project_id}/batch-nodes HTTP read contract", () => {
  externalTest("snapshots an empty explicit batch", async () => {
    const scenario = readScenarios;
    const response = await batch(
      scenario.projects.nodes.id,
      [],
      scenario.projects.nodes.latestVersion,
    );
    const body = parseReadContract(BatchNodesResponseSchema, response.body);

    expect(response.status).toBe(200);
    expect(body.results).toEqual([]);
  });

  externalTest("freezes mixed full payloads, incumbent ordering, and unknown/deleted omission", async () => {
    const scenario = readScenarios;
    const refs: NodeRef[] = [
      { nodeType: "argument", id: scenario.nodes.currentOnlyArgument },
      { nodeType: "beteiligungs_eingang", id: scenario.nodes.versionedBeteiligungsEingang },
      { nodeType: "argument", id: scenario.nodes.unknownArgument },
      { nodeType: "beteiligungs_eingang_markdown", id: scenario.nodes.versionedMarkdown },
      { nodeType: "argument", id: scenario.nodes.versionedArgument },
      { nodeType: "argument", id: scenario.nodes.deletedArgument },
    ];
    const response = await batch(
      scenario.projects.nodes.id,
      refs,
      scenario.projects.nodes.latestVersion,
    );
    const body = parseReadContract(BatchNodesResponseSchema, response.body);

    expect(response.status).toBe(200);
    expect(body.results.map((node) => node.id)).toEqual(scenario.nodes.expectedMixedBatchOrder);
    expect(body.results.map((node) => node.id)).not.toContain(scenario.nodes.unknownArgument);
    expect(body.results.map((node) => node.id)).not.toContain(scenario.nodes.deletedArgument);
  });

  externalTest("snapshots an unknown-only batch", async () => {
    const scenario = readScenarios;
    const response = await batch(
      scenario.projects.nodes.id,
      [{ nodeType: "argument", id: scenario.nodes.unknownArgument }],
      scenario.projects.nodes.latestVersion,
    );
    const body = parseReadContract(BatchNodesResponseSchema, response.body);

    expect(response.status).toBe(200);
    expect(body.results).toEqual([]);
  });

  externalTest("snapshots explicit historical full payloads", async () => {
    const scenario = readScenarios;
    const refs: NodeRef[] = [
      { nodeType: "beteiligungs_eingang", id: scenario.nodes.versionedBeteiligungsEingang },
      { nodeType: "beteiligungs_eingang_markdown", id: scenario.nodes.versionedMarkdown },
      { nodeType: "argument", id: scenario.nodes.versionedArgument },
    ];
    const response = await batch(
      scenario.projects.nodes.id,
      refs,
      scenario.projects.nodes.historicalVersion,
    );
    const body = parseReadContract(BatchNodesResponseSchema, response.body);

    expect(response.status).toBe(200);
    expect(body.results.map(({ id }) => id).sort()).toEqual(
      [
        scenario.nodes.versionedBeteiligungsEingang,
        scenario.nodes.versionedMarkdown,
        scenario.nodes.versionedArgument,
      ].sort(),
    );
  });

});
