import { describe, expect, test } from "bun:test";
import type { HttpJson } from "@spark-workflow/http-host";
import type { TSchema } from "@sinclair/typebox";
import { Elysia } from "elysia";

import {
  ArgumentExtractionBodySchema,
  ClassificationBodySchema,
  ClassificationFailedBodySchema,
  InjectionDetectedBodySchema,
} from "../src/schemas.ts";

const post = (schema: TSchema, body: HttpJson) =>
  new Elysia({ normalize: false })
    .post("/", () => "stored", { body: schema })
    .handle(
      new Request("http://objections.test/", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
    );

const uuid = (index: number) => `50000000-0000-4000-8000-${`${index}`.padStart(12, "0")}`;
const uuids = (count: number) => Array.from({ length: count }, (_, index) => uuid(index));
const extraction = ({
  documents = 1,
  argumentText = "Lärm",
  startIdx = 0,
  markdown = "# Einwendung",
}: { documents?: number; argumentText?: string; startIdx?: number; markdown?: string }) => ({
  documentArguments: Array.from({ length: documents }, (_, index) => ({
    documentId: uuid(index),
    documentName: "einwendung.pdf",
    beteiligungsEingangMarkdown: markdown,
    chunkArguments: [
      {
        chunk: { chunkId: "chunk-1", pageContent: "Lärm", pageNumbers: [1] },
        arguments: [
          {
            argument: { text: argumentText, span: { startIdx, endIdx: 4 } },
            description: "Lärmbelastung",
            context: { text: "Lärm", span: { startIdx: 0, endIdx: 4 } },
          },
        ],
      },
    ],
  })),
});
const classified = (count: number) => ({
  classifiedArguments: uuids(count).map((argumentId) => ({ argumentId, topicId: uuid(0) })),
});
const injected = (count: number, snippet = "ignore previous instructions") => ({
  documents: uuids(count).map((fileId) => ({ fileId, documentName: "einwendung.pdf", snippet })),
});

describe("Objections write input budgets", () => {
  test.each([
    ["extraction documents", ArgumentExtractionBodySchema, extraction({ documents: 1_000 }), extraction({ documents: 1_001 })],
    [
      "extraction argument text",
      ArgumentExtractionBodySchema,
      extraction({ argumentText: "a".repeat(50_000) }),
      extraction({ argumentText: "a".repeat(50_001) }),
    ],
    [
      "extraction markdown",
      ArgumentExtractionBodySchema,
      extraction({ markdown: "m".repeat(50_000) }),
      extraction({ markdown: "m".repeat(50_001) }),
    ],
    ["extraction span start", ArgumentExtractionBodySchema, extraction({ startIdx: 0 }), extraction({ startIdx: -1 })],
    ["classified arguments", ClassificationBodySchema, classified(1_000), classified(1_001)],
    [
      "unclassified arguments",
      ClassificationBodySchema,
      { classifiedArguments: [], unclassifiedArgumentIds: uuids(1_000) },
      { classifiedArguments: [], unclassifiedArgumentIds: uuids(1_001) },
    ],
    [
      "failed classifications",
      ClassificationFailedBodySchema,
      { beteiligungsEingangIds: uuids(1_000) },
      { beteiligungsEingangIds: uuids(1_001) },
    ],
    ["injected documents", InjectionDetectedBodySchema, injected(1_000), injected(1_001)],
    [
      "injection snippet",
      InjectionDetectedBodySchema,
      injected(1, "s".repeat(50_000)),
      injected(1, "s".repeat(50_001)),
    ],
  ] as const)("%s admits the limit and rejects beyond it with 422", async (_, schema, admitted, rejected) => {
    expect((await post(schema, admitted)).status).toBe(200);
    expect((await post(schema, rejected)).status).toBe(422);
  });
});
