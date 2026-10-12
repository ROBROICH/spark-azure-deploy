import { describe, expect } from "bun:test";

import {
  ErrorResponseSchema,
  TemplateCategoriesSchema,
  TocNotesSchema,
  parseReadContract,
} from "../support/read-contracts.ts";
import { externalTest, readJson } from "../support/external-app.ts";
import { readScenarios } from "../support/read-scenarios.ts";

const tocNotes = (projectId: string) => readJson(`/${projectId}/toc-notes`);

describe("GET /{project_id}/toc-notes HTTP read contract", () => {
  externalTest(
    "snapshots success status, newest-first notes, resolution, and soft deletion",
    async () => {
      const response = await tocNotes(readScenarios.projects.populated.id);
      const body = parseReadContract(TocNotesSchema, response.body);

      expect(body.notes.map(({ id }) => id)).toEqual([
        readScenarios.toc.newestResolved,
        readScenarios.toc.olderOpen,
      ]);
      expect(body.notes.map(({ id }) => id)).not.toContain(readScenarios.toc.deleted);
      expect({ status: response.status, body }).toMatchSnapshot();
    },
  );

  externalTest("snapshots no-table and no-result states", async () => {
    const entries = await Promise.all(
      [readScenarios.projects.tocWithoutTable.id, readScenarios.projects.empty.id].map(
        async (projectId) => {
          const response = await tocNotes(projectId);
          return {
            status: response.status,
            body: parseReadContract(TocNotesSchema, response.body),
          };
        },
      ),
    );

    expect(entries).toMatchSnapshot();
  });

  externalTest("snapshots the unknown project response", async () => {
    const response = await tocNotes(readScenarios.projects.unknown.id);
    const body = parseReadContract(ErrorResponseSchema, response.body);

    expect({ status: response.status, body }).toMatchSnapshot();
  });
});

describe("GET /{project_type_id}/template-categories HTTP read contract", () => {
  externalTest(
    "snapshots nested category ordering, expected counts, and soft deletion",
    async () => {
      const response = await readJson(
        `/${readScenarios.projectTypes.populated}/template-categories`,
      );
      const body = parseReadContract(TemplateCategoriesSchema, response.body);

      expect(body.map(({ name }) => name)).toEqual(["A Pflichtunterlagen", "B Weitere Unterlagen"]);
      expect(
        body.flatMap(({ templateDocumentTypes }) => templateDocumentTypes).map(({ id }) => id),
      ).not.toContain(readScenarios.templateDocumentTypes.deletedNested);
      expect(body.map(({ id }) => id)).not.toContain(readScenarios.templateCategories.deleted);
      expect({ status: response.status, body }).toMatchSnapshot();
    },
  );

  externalTest("snapshots empty and separately scoped project types", async () => {
    const entries = await Promise.all(
      [readScenarios.projectTypes.empty, readScenarios.projectTypes.other].map(
        async (projectTypeId) => {
          const response = await readJson(`/${projectTypeId}/template-categories`);
          return {
            status: response.status,
            body: parseReadContract(TemplateCategoriesSchema, response.body),
          };
        },
      ),
    );

    expect(entries).toMatchSnapshot();
  });
});
