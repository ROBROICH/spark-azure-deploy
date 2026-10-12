import { describe, expect, test } from "bun:test";
import { Result } from "better-result";
import type { EvlogError } from "evlog";

import { createObjectionsService } from "../src/routes/ewms.ts";

const span = (startIdx: number, endIdx: number) => ({ startIdx, endIdx });
const extraction = (argument: ReturnType<typeof span>, context: ReturnType<typeof span>) => ({
  documentArguments: [
    {
      documentId: "50000000-0000-4000-8000-000000000001",
      documentName: "E-einwendung.pdf",
      chunkArguments: [
        {
          chunk: { chunkId: "chunk-1", pageContent: "Lärm und Staub", pageNumbers: [1] },
          arguments: [
            {
              argument: { text: "Lärm", span: argument },
              description: "Lärmbelastung",
              context: { text: "Lärm und Staub", span: context },
            },
          ],
        },
      ],
    },
  ],
});

describe("Objections argument extraction spans", () => {
  test.each([
    ["valid spans", extraction(span(0, 4), span(0, 14)), { outcome: "stored", writes: 1 }],
    ["empty spans", extraction(span(4, 4), span(14, 14)), { outcome: "stored", writes: 1 }],
    ["a reversed argument span", extraction(span(5, 4), span(0, 14)), { outcome: 422, writes: 0 }],
    ["a reversed context span", extraction(span(0, 4), span(15, 14)), { outcome: 422, writes: 0 }],
  ] as const)("%s", async (_, body, expected) => {
    let writes = 0;
    const service = createObjectionsService(
      {
        query: async () => {
          writes += 1;
          return { results: [] } as never;
        },
        streamRows: async function* () {},
        transact: async (callback) => callback(),
      },
      {
        validateWriteVersion: async () => Result.ok(undefined),
        listTopics: async () => Result.ok([]),
        batchNodes: async () => Result.ok([]),
      },
    );

    const outcome = await service
      .storeExtractionResults("51000000-0000-4000-8000-000000000001", 1, body)
      .then(() => "stored", (error: EvlogError) => error.status);

    expect({ outcome, writes }).toEqual(expected);
  });
});
