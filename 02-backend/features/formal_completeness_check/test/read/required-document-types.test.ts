import { describe, expect } from "bun:test";

import { RequiredDocumentTypesSchema, parseReadContract } from "../support/read-contracts.ts";
import { externalTest, readJson } from "../support/external-app.ts";
import { readScenarios } from "../support/read-scenarios.ts";

const versionQuery = (version?: number) =>
  version === undefined ? "" : `?projectVersion=${version}`;

describe("GET /{project_id}/required-document-types HTTP read contract", () => {
  externalTest(
    "snapshots category ordering, system/custom origin, resolution, and soft deletion",
    async () => {
      const response = await readJson(
        `/${readScenarios.projects.populated.id}/required-document-types?projectVersion=3`,
      );
      const body = parseReadContract(RequiredDocumentTypesSchema, response.body);

      expect(body.categories.map((category) => category.categoryName)).toEqual([
        "A Allgemeine Unterlagen",
        "B Umweltunterlagen",
        "Benutzerdefiniert",
      ]);
      expect(
        body.categories
          .flatMap((category) => category.requiredDocuments)
          .map(({ documentTypeId }) => documentTypeId),
      ).not.toContain(readScenarios.documentTypes.currentDeleted);
      expect({ status: response.status, body }).toMatchSnapshot();
    },
  );

  for (const [name, projectId, version] of [
    ["historical version", readScenarios.projects.populated.id, 2],
    ["empty project", readScenarios.projects.empty.id, 1],
  ] as const) {
    externalTest(`snapshots the ${name}`, async () => {
      const response = await readJson(
        `/${projectId}/required-document-types${versionQuery(version)}`,
      );
      const body = parseReadContract(RequiredDocumentTypesSchema, response.body);

      expect({ status: response.status, body }).toMatchSnapshot();
    });
  }

  externalTest("omitted version resolves to the current categories", async () => {
    const explicit = await readJson(
      `/${readScenarios.projects.populated.id}/required-document-types?projectVersion=3`,
    );
    const implicit = await readJson(
      `/${readScenarios.projects.populated.id}/required-document-types`,
    );
    const implicitBody = parseReadContract(RequiredDocumentTypesSchema, implicit.body);
    const explicitBody = parseReadContract(RequiredDocumentTypesSchema, explicit.body);

    expect(implicitBody).toEqual(explicitBody);
    expect({ status: implicit.status, body: implicitBody }).toMatchSnapshot();
  });
});
