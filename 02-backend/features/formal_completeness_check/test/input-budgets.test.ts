import { describe, expect, test } from "bun:test";
import type { HttpJson } from "@spark-workflow/http-host";
import type { TSchema } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import { Elysia } from "elysia";

import {
  CreateRequiredDocumentTypeSchema,
  CreateTocNotesSchema,
  PatchRequiredDocumentTypeSchema,
  TocResultSchema,
} from "../src/schemas.ts";

const post = (schema: TSchema, body: HttpJson) =>
  new Elysia({ normalize: false })
    .post("/", () => "stored", { body: schema })
    .handle(
      new Request("http://formal-completeness.test/", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
    );

const tocResult = (matches: number, documents: number, name = "Erläuterungsbericht") => ({
  inhaltsverzeichnisExtractionOutput: { status: "success", metadata: { documentId: "toc" } },
  inhaltsverzeichnisMatchingOutput: {
    matchedDocumentTypes: Array.from({ length: matches }, () => ({
      requiredDocumentType: { documentTypeName: name },
      assignedDocuments: Array.from({ length: documents }, () => ({})),
    })),
  },
});

describe("Formal Completeness write input budgets", () => {
  test.each([
    ["TOC note count", CreateTocNotesSchema, 1_000, (size: number) => Array.from({ length: size }, () => ({ content: "note" }))],
    ["TOC note content", CreateTocNotesSchema, 50_000, (size: number) => [{ content: "c".repeat(size) }]],
    ["custom type name", CreateRequiredDocumentTypeSchema, 1_000, (size: number) => ({ documentName: "n".repeat(size) })],
    ["patched type name", PatchRequiredDocumentTypeSchema, 1_000, (size: number) => ({ documentName: "n".repeat(size) })],
  ] as const)("%s admits the limit and rejects one more with 422", async (_, schema, limit, body) => {
    expect((await post(schema, body(limit))).status).toBe(200);
    expect((await post(schema, body(limit + 1))).status).toBe(422);
  });

  test.each([
    ["matched document types", 1_000, (size: number) => tocResult(size, 0)],
    ["assigned documents", 1_000, (size: number) => tocResult(1, size)],
    ["document type name", 1_000, (size: number) => tocResult(1, 0, "n".repeat(size))],
  ] as const)("TOC result %s admits the limit and rejects one more", (_, limit, result) => {
    expect(Value.Check(TocResultSchema, result(limit))).toBe(true);
    expect(Value.Check(TocResultSchema, result(limit + 1))).toBe(false);
  });
});
