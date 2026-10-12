import { describe, expect } from "bun:test";
import type { Static } from "@sinclair/typebox";

import {
  ErrorResponseSchema,
  NodeListSchema,
  parseReadContract,
} from "../support/read-contracts.ts";
import { externalTest, readJson } from "../support/external-app.ts";
import { readScenarios } from "../support/read-scenarios.ts";

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

async function nodes(projectId: string, version?: number) {
  return readJson(
    `/${projectId}/nodes${version === undefined ? "" : `?projectVersion=${version}`}`,
  );
}

describe("GET /{project_id}/nodes HTTP contract", () => {
  externalTest(
    "snapshots bounded current nodes, parent metadata, flags, and deleted exclusion",
    async () => {
      const response = await nodes(
        readScenarios.projects.populated.id,
        readScenarios.projects.populated.latestVersion,
      );
      const body = canonicalNodeList(parseReadContract(NodeListSchema, response.body));

      expect(response.status).toBe(200);
      expect(body.nodes.map(({ id }) => id)).toEqual([
        readScenarios.nodes.law,
        readScenarios.nodes.versionedNorm,
        readScenarios.nodes.currentOnlyNorm,
      ]);
      expect(body.nodes.map(({ id }) => id)).not.toContain(readScenarios.nodes.deletedNorm);
      expect(
        body.nodes.find(({ id }) => id === readScenarios.nodes.versionedNorm)?.parents,
      ).toEqual([{ id: readScenarios.nodes.law, nodeType: "gesetz" }]);
      expect({ status: response.status, body }).toMatchSnapshot();
    },
  );

  externalTest("snapshots an explicit empty version", async () => {
    const empty = await nodes(
      readScenarios.projects.empty.id,
      readScenarios.projects.empty.latestVersion,
    );
    const payload = {
      empty: {
        status: empty.status,
        body: canonicalNodeList(parseReadContract(NodeListSchema, empty.body)),
      },
    };
    expect(payload.empty.body.nodes).toEqual([]);
    expect(payload).toMatchSnapshot();
  });

  externalTest("omitted version equals the explicit current payload", async () => {
    const explicit = await nodes(
      readScenarios.projects.populated.id,
      readScenarios.projects.populated.latestVersion,
    );
    const explicitBody = canonicalNodeList(parseReadContract(NodeListSchema, explicit.body));
    const implicit = await nodes(readScenarios.projects.populated.id);
    const implicitBody = canonicalNodeList(parseReadContract(NodeListSchema, implicit.body));

    expect(implicitBody).toEqual(explicitBody);
    expect({ status: implicit.status, body: implicitBody }).toMatchSnapshot();
  });

  for (const [name, projectId] of [
    ["unknown project", readScenarios.projects.unknown.id],
    ["missing latest version", readScenarios.projects.missingVersion.id],
    ["upstream failure", readScenarios.projects.upstreamFailure.id],
  ] as const) {
    externalTest(`returns 500 for ${name} during omitted-version lookup`, async () => {
      const response = await nodes(projectId);
      parseReadContract(ErrorResponseSchema, response.body);

      expect(response.status).toBe(500);
    });
  }
});
