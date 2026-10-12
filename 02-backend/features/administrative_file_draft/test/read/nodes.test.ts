import { describe, expect } from "bun:test";

import {
  BatchNodesResponseSchema,
  ErrorResponseSchema,
  NodeListSchema,
  canonicalizeUnorderedNodeList,
  parseReadContract,
} from "../support/read-contracts.ts";
import { externalTest, readJson } from "../support/external-app.ts";
import { readScenarios } from "../support/read-scenarios.ts";

const batch = (
  projectId: string,
  nodes: Array<{ nodeType: "risks" | "vae_node"; id: string }>,
  version?: number,
) =>
  readJson(
    `/${projectId}/batch-nodes${version === undefined ? "" : `?projectVersion=${version}`}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ nodes }),
    },
  );

describe("GET /{project_id}/nodes HTTP contract", () => {
  externalTest("snapshots the explicit current version", async () => {
    const response = await readJson(
      `/${readScenarios.projects.populated.id}/nodes?projectVersion=2`,
    );
    const body = canonicalizeUnorderedNodeList(parseReadContract(NodeListSchema, response.body));

    expect({ status: response.status, body }).toMatchSnapshot();
  });

  externalTest("snapshots the explicit historical version", async () => {
    const response = await readJson(
      `/${readScenarios.projects.populated.id}/nodes?projectVersion=1`,
    );
    const body = canonicalizeUnorderedNodeList(parseReadContract(NodeListSchema, response.body));

    expect({ status: response.status, body }).toMatchSnapshot();
  });

  externalTest("omitted version resolves to the same current payload", async () => {
    const explicit = await readJson(
      `/${readScenarios.projects.populated.id}/nodes?projectVersion=2`,
    );
    const implicit = await readJson(`/${readScenarios.projects.populated.id}/nodes`);
    const implicitBody = canonicalizeUnorderedNodeList(
      parseReadContract(NodeListSchema, implicit.body),
    );
    const explicitBody = canonicalizeUnorderedNodeList(
      parseReadContract(NodeListSchema, explicit.body),
    );

    expect(implicitBody).toEqual(explicitBody);
    expect({ status: implicit.status, body: implicitBody }).toMatchSnapshot();
  });

  externalTest("snapshots an empty project", async () => {
    const response = await readJson(`/${readScenarios.projects.empty.id}/nodes?projectVersion=1`);
    const body = canonicalizeUnorderedNodeList(parseReadContract(NodeListSchema, response.body));

    expect({ status: response.status, body }).toMatchSnapshot();
  });

  externalTest("returns an error for an unknown project when version is omitted", async () => {
    const response = await readJson(`/${readScenarios.projects.unknown.id}/nodes`);
    parseReadContract(ErrorResponseSchema, response.body);

    expect(response.status).toBe(404);
  });
});

describe("POST /{project_id}/batch-nodes HTTP contract", () => {
  externalTest("snapshots an empty request", async () => {
    const response = await batch(readScenarios.projects.populated.id, [], 2);
    const body = parseReadContract(BatchNodesResponseSchema, response.body);

    expect({ status: response.status, body }).toMatchSnapshot();
  });

  externalTest(
    "parses every full payload field and preserves mixed node-type input grouping",
    async () => {
      const response = await batch(
        readScenarios.projects.populated.id,
        [
          { nodeType: "risks", id: readScenarios.risks.currentLow },
          { nodeType: "vae_node", id: readScenarios.nodes.currentChild },
        ],
        2,
      );
      const body = parseReadContract(BatchNodesResponseSchema, response.body);
      const vaeNode = body.results.find((node) => node.nodeType === "vae_node");
      if (vaeNode?.checkedAtAssignee) {
        vaeNode.checkedAtAssignee = new Date(vaeNode.checkedAtAssignee).toISOString();
      }

      expect(body.results.map((node) => node.nodeType)).toEqual(["risks", "vae_node"]);
      expect({ status: response.status, body }).toMatchSnapshot();
    },
  );

  externalTest("omits unknown IDs", async () => {
    const response = await batch(
      readScenarios.projects.populated.id,
      [
        { nodeType: "vae_node", id: readScenarios.nodes.unknown },
        { nodeType: "risks", id: readScenarios.risks.unknown },
      ],
      2,
    );
    const body = parseReadContract(BatchNodesResponseSchema, response.body);

    expect({ status: response.status, body }).toMatchSnapshot();
  });

  externalTest("snapshots an explicit historical lookup", async () => {
    const response = await batch(
      readScenarios.projects.populated.id,
      [
        { nodeType: "vae_node", id: readScenarios.nodes.historicalRoot },
        { nodeType: "risks", id: readScenarios.risks.historical },
      ],
      1,
    );
    const body = parseReadContract(BatchNodesResponseSchema, response.body);

    expect({ status: response.status, body }).toMatchSnapshot();
  });

  externalTest("omitted version resolves to the current lookup", async () => {
    const refs = [{ nodeType: "vae_node" as const, id: readScenarios.nodes.currentRoot }];
    const explicit = await batch(readScenarios.projects.populated.id, refs, 2);
    const implicit = await batch(readScenarios.projects.populated.id, refs);
    const implicitBody = parseReadContract(BatchNodesResponseSchema, implicit.body);
    const explicitBody = parseReadContract(BatchNodesResponseSchema, explicit.body);

    expect(implicitBody).toEqual(explicitBody);
    expect({ status: implicit.status, body: implicitBody }).toMatchSnapshot();
  });
});
