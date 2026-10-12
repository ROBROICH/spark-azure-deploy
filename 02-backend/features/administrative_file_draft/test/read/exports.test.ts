import { describe, expect } from "bun:test";

import canonicalExport from "../../fixtures/canonical-export.json";
import { inspectDocx, inspectPdf, normalizePdfTocDotLeaders } from "../support/documents.ts";
import { ErrorResponseSchema, parseReadContract } from "../support/read-contracts.ts";
import { externalTest, readDocument, readJson } from "../support/external-app.ts";
import { readScenarios } from "../support/read-scenarios.ts";

describe("Administrative File Draft document export read contract", () => {
  externalTest("POST /{project_id}/export/docx freezes semantic DOCX output", async () => {
    const response = await readDocument(`/${readScenarios.projects.populated.id}/export/docx`, {
      method: "POST",
    });
    const document = await inspectDocx(response.bytes, {
      bodyParagraphCount: canonicalExport.document.orderedBody.length,
    });
    const { allText: _allText, ...documentSummary } = document;

    expect(response.status).toBe(200);
    expect(response.contentType).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    expect(response.contentDisposition).toBe(
      `attachment; filename=beschluss_${readScenarios.projects.populated.id}.docx`,
    );
    expect(document.bodySuffix).toEqual(canonicalExport.document.orderedBody);
    expect(documentSummary).toMatchSnapshot();
  });

  externalTest("POST /{project_id}/export/pdf freezes semantic PDF output", async () => {
    const response = await readDocument(`/${readScenarios.projects.populated.id}/export/pdf`, {
      method: "POST",
    });
    const document = await inspectPdf(response.bytes);

    expect(response.status).toBe(200);
    expect(response.contentType).toBe("application/pdf");
    expect(response.contentDisposition).toBe(
      `attachment; filename=beschluss_${readScenarios.projects.populated.id}.pdf`,
    );
    for (const expected of canonicalExport.document.orderedBody) {
      expect(document.text).toContain(expected);
    }
    expect({ ...document, text: normalizePdfTocDotLeaders(document.text) }).toMatchSnapshot();
  });

  for (const format of ["docx", "pdf"] as const) {
    for (const [name, projectId] of [
      ["no exportable nodes", readScenarios.projects.noExportableNodes.id],
      ["unknown project", readScenarios.projects.unknown.id],
    ] as const) {
      externalTest(`POST export/${format} reports ${name}`, async () => {
        const response = await readJson(`/${projectId}/export/${format}`, { method: "POST" });
        parseReadContract(ErrorResponseSchema, response.body);

        expect(response.status).toBe(404);
      });
    }
  }

  externalTest(
    "POST exports snapshot real converter failures",
    async () => {
      const statuses = await Promise.all(
        (["docx", "pdf"] as const).map(async (format) => {
          const response = await readJson(
            `/${readScenarios.projects.populated.id}/export/${format}`,
            { method: "POST" },
            "converter-failure",
          );
          parseReadContract(ErrorResponseSchema, response.body);
          return response.status;
        }),
      );
      expect(statuses).toEqual([502, 502]);
    },
    60_000,
  );
});
