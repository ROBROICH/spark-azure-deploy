import { expect, test } from "bun:test";

import canonicalExport from "../fixtures/canonical-export.json";
import { inspectDocx, inspectPdf } from "./support/documents.ts";
import { readScenarios } from "./support/read-scenarios.ts";

const configuredBaseUrl = Bun.env.AFD_REAL_CONVERTER_BASE_URL?.trim();
const imageTest = configuredBaseUrl ? test : test.skip;

const exportDocument = async (format: "docx" | "pdf") => {
  const response = await fetch(
    new URL(`/${readScenarios.projects.populated.id}/export/${format}`, configuredBaseUrl),
    { method: "POST" },
  );
  return {
    response,
    bytes: new Uint8Array(await response.arrayBuffer()),
  };
};

imageTest(
  "exports semantic DOCX and PDF through the converter configured in the built image",
  async () => {
    const docx = await exportDocument("docx");
    expect(docx.response.status).toBe(200);
    expect(docx.response.headers.get("content-type")).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    const docxDocument = await inspectDocx(docx.bytes, {
      bodyParagraphCount: canonicalExport.document.orderedBody.length,
    });
    expect(docxDocument.bodySuffix).toEqual(canonicalExport.document.orderedBody);
    expect(docxDocument.allText).not.toContain("DARF EBENFALLS NICHT ERSCHEINEN");

    const pdf = await exportDocument("pdf");
    expect(pdf.response.status).toBe(200);
    expect(pdf.response.headers.get("content-type")).toBe("application/pdf");
    const pdfDocument = await inspectPdf(pdf.bytes);
    for (const expected of canonicalExport.document.orderedBody) {
      expect(pdfDocument.text).toContain(expected);
    }
    expect(pdfDocument.text).not.toContain("DARF EBENFALLS NICHT ERSCHEINEN");
  },
  120_000,
);
