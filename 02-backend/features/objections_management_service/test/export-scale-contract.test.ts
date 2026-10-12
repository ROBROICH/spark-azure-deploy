import { describe, expect, test } from "bun:test";
import type { BetterDrizzleClient } from "better-drizzle";
import { Result } from "better-result";

import { CSV_COLUMNS } from "../src/csv";
import type { ObjectionsSchema } from "../src/db/schema";
import { exportArguments } from "../src/routes/arguments";

const ARGUMENT_COUNT = 5000;
const PAGE_LIMIT = 1000;
const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const FILE_ID = "22222222-2222-4222-8222-222222222222";
const FILENAME = "E_Sammeleinwendung.pdf";

type ArgumentRow = {
  argumentId: string;
  topicId: string | null;
  subTopicId: string | null;
  text: string | null;
  context: string | null;
  erwiderung: string | null;
  einordnung: string | null;
};

const fixtureArguments: ArgumentRow[] = Array.from({ length: ARGUMENT_COUNT }, (_, index) => ({
  argumentId: `A${String(index).padStart(5, "0")}`,
  topicId: null,
  subTopicId: null,
  text: `Argument ${index}`,
  context: `Kontext ${index}`,
  erwiderung: `Erwiderung ${index}`,
  einordnung: `Einordnung ${index}`,
}));

class FakeDocuments {
  uploadCalls = 0;
  uploadedContent: Uint8Array | undefined;
  readonly uploadedFileId = "33333333-3333-4333-8333-333333333333";

  async listProjectFiles(
    _projectId: string,
    _projectVersion: number,
    fileType: "document" | "ewms_document",
  ) {
    if (fileType === "ewms_document") {
      return [
        {
          id: FILE_ID,
          type: "ewms_document",
          filename: FILENAME,
          projectId: PROJECT_ID,
          projectVersion: 1,
        },
      ];
    }
    return [];
  }

  async uploadInternalFile(input: { content: Uint8Array }): Promise<string> {
    this.uploadCalls += 1;
    this.uploadedContent = input.content;
    return this.uploadedFileId;
  }
}

const fakeProjects: Parameters<typeof exportArguments>[1] = {
  resolveLatestVersion: async () => Result.ok(1),
  listTopics: async () => Result.ok([]),
  batchNodes: async () => Result.ok([]),
  exportMetadata: async () =>
    Result.ok({ name: "Grossverfahren", internalProjectNumber: "", latestVersion: 1 }),
};

function createBoundedExportRuntime() {
  let liveRows = 0;
  let peakLiveRows = 0;

  const database = Object.assign(Object.create(null), {
    beteiligungsEingaenge: {
      findMany: async () => [{ fileId: FILE_ID }],
    },
    argumentsTable: {
      findMany: async (query: { skip?: number; take?: number }) => {
        const page = fixtureArguments
          .slice(query.skip ?? 0, (query.skip ?? 0) + (query.take ?? fixtureArguments.length))
          .map((argument) => ({
            ...argument,
            beteiligungsEingang: {
              fileId: FILE_ID,
              isDeleted: false,
              projectId: PROJECT_ID,
              projectVersion: 1,
            },
          }));
        liveRows += page.length;
        peakLiveRows = Math.max(peakLiveRows, liveRows);
        queueMicrotask(() => {
          liveRows -= page.length;
        });
        return page;
      },
    },
  }) as BetterDrizzleClient<ObjectionsSchema>;

  return { database, peakLiveRows: () => peakLiveRows };
}

describe("Objections export scale contract", () => {
  test("streams a bounded 5k-argument export", async () => {
    const { database, peakLiveRows } = createBoundedExportRuntime();
    const documents = new FakeDocuments();
    const result = await exportArguments(database, fakeProjects, documents, PROJECT_ID);

    expect(result).toEqual({ fileId: documents.uploadedFileId });
    expect(documents.uploadCalls).toBe(1);
    expect(documents.uploadedContent).toBeDefined();

    const content = documents.uploadedContent as Uint8Array;
    expect(content[0]).toBe(0xef);
    expect(content[1]).toBe(0xbb);
    expect(content[2]).toBe(0xbf);

    const text = new TextDecoder("utf-8", { ignoreBOM: false }).decode(content);
    const lines = text.split("\r\n");
    expect(lines[0]).toBe(CSV_COLUMNS.join(";"));
    expect(lines.length).toBe(ARGUMENT_COUNT + 2);
    expect(lines.at(-1)).toBe("");

    const dataLines = lines.slice(1, -1);
    expect(dataLines.length).toBe(ARGUMENT_COUNT);
    expect(dataLines[0]).toBe(
      `A00000;;;Argument 0;Kontext 0;Erwiderung 0;Einordnung 0;${FILENAME}`,
    );
    expect(dataLines.at(-1)).toBe(
      `A0${ARGUMENT_COUNT - 1};;;Argument ${ARGUMENT_COUNT - 1};Kontext ${ARGUMENT_COUNT - 1};Erwiderung ${ARGUMENT_COUNT - 1};Einordnung ${ARGUMENT_COUNT - 1};${FILENAME}`,
    );

    expect(peakLiveRows()).toBeLessThanOrEqual(PAGE_LIMIT);
    expect(peakLiveRows()).toBeGreaterThan(0);
  });
});
