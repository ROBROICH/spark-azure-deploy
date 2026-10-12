import { describe, expect } from "bun:test";

import {
  ErrorResponseSchema,
  FormalCompletenessResultsSchema,
  parseReadContract,
} from "../support/read-contracts.ts";
import { externalTest, readJson } from "../support/external-app.ts";
import { readScenarios } from "../support/read-scenarios.ts";

const results = (projectId: string, version?: number) =>
  readJson(`/${projectId}${version === undefined ? "" : `?projectVersion=${version}`}`);

describe("GET /{project_id} HTTP read contract", () => {
  externalTest("snapshots complete, incomplete, grouped, and ordered current results", async () => {
    const response = await results(readScenarios.projects.populated.id, 3);
    const body = parseReadContract(FormalCompletenessResultsSchema, response.body);

    expect(
      body.matchedDocumentTypes.map((entry) => entry.requiredDocumentType.documentTypeName),
    ).toEqual(["Antrag", "Umweltbericht", "Eigene Anlage"]);
    expect(body.matchedDocumentTypes[0]?.assignedDocuments).toHaveLength(2);
    expect(body.matchedDocumentTypes[2]?.assignedDocuments).toHaveLength(0);
    expect(body.unassignedDocuments).toHaveLength(2);
    expect({ status: response.status, body }).toMatchSnapshot();
  });

  externalTest("snapshots an explicit historical version", async () => {
    const response = await results(readScenarios.projects.populated.id, 2);
    const body = parseReadContract(FormalCompletenessResultsSchema, response.body);

    expect({ status: response.status, body }).toMatchSnapshot();
  });

  externalTest("omitted version resolves to the same current payload", async () => {
    const explicit = await results(readScenarios.projects.populated.id, 3);
    const implicit = await results(readScenarios.projects.populated.id);
    const implicitBody = parseReadContract(FormalCompletenessResultsSchema, implicit.body);
    const explicitBody = parseReadContract(FormalCompletenessResultsSchema, explicit.body);

    expect(implicitBody).toEqual(explicitBody);
    expect({ status: implicit.status, body: implicitBody }).toMatchSnapshot();
  });

  externalTest("snapshots a project with no stored results", async () => {
    const response = await results(readScenarios.projects.empty.id);
    const body = parseReadContract(FormalCompletenessResultsSchema, response.body);

    expect({ status: response.status, body }).toMatchSnapshot();
  });

  externalTest("snapshots the unknown project response", async () => {
    const response = await results(readScenarios.projects.unknown.id);
    const body = parseReadContract(ErrorResponseSchema, response.body);

    expect({ status: response.status, body }).toMatchSnapshot();
  });
});
