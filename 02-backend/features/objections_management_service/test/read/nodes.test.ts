import { describe, expect } from "bun:test";

import {
  NodeListSchema,
  canonicalizeUnorderedNodeList,
  parseReadContract,
} from "../support/read-contracts.ts";
import { externalTest, readJson } from "../support/external-app.ts";
import { readScenarios } from "../support/read-scenarios.ts";

const nodesPath = (projectId: string, version?: number) =>
  `/${projectId}/nodes${version === undefined ? "" : `?projectVersion=${version}`}`;

describe("GET /{project_id}/nodes HTTP contract", () => {
  externalTest("snapshots the populated current graph and deleted exclusion", async () => {
    const scenario = readScenarios;
    const response = await readJson(
      nodesPath(scenario.projects.nodes.id, scenario.projects.nodes.latestVersion),
    );
    const body = canonicalizeUnorderedNodeList(parseReadContract(NodeListSchema, response.body));

    expect(response.status).toBe(200);
    expect(body.nodes.map((node) => node.id).sort()).toEqual(
      [...scenario.nodes.currentActiveIds].sort(),
    );
    expect(body.nodes.map((node) => node.id)).not.toContain(scenario.nodes.deletedArgument);
    expect(new Set(body.nodes.map((node) => node.nodeType))).toEqual(
      new Set(["beteiligungs_eingang", "beteiligungs_eingang_markdown", "argument"]),
    );
  });

  externalTest("snapshots the explicit historical graph", async () => {
    const scenario = readScenarios;
    const response = await readJson(
      nodesPath(scenario.projects.nodes.id, scenario.projects.nodes.historicalVersion),
    );
    const body = canonicalizeUnorderedNodeList(parseReadContract(NodeListSchema, response.body));

    expect(response.status).toBe(200);
    expect(body.nodes.map(({ id }) => id).sort()).toEqual(
      [
        scenario.nodes.versionedBeteiligungsEingang,
        scenario.nodes.versionedMarkdown,
        scenario.nodes.versionedArgument,
      ].sort(),
    );
  });

  externalTest("snapshots an explicit empty graph", async () => {
    const scenario = readScenarios;
    const response = await readJson(
      nodesPath(scenario.projects.empty.id, scenario.projects.empty.latestVersion),
    );
    const body = canonicalizeUnorderedNodeList(parseReadContract(NodeListSchema, response.body));

    expect(response.status).toBe(200);
    expect(body.nodes).toEqual([]);
  });

});
