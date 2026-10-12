import { describe, expect, test } from "bun:test";
import { EvlogError } from "evlog";
import { examinationReader, projectReader, nodeFixture } from "./support/node-fixtures.ts";

import type { FileObject } from "../src/schemas.ts";
import {
  createAosActivities,
  listProjectFiles,
  type AosActivityDependencies,
} from "../src/temporal/activities.ts";

const projectId = "00000000-0000-4000-8000-000000000101";
const fileId = "00000000-0000-4000-8000-000000000201";
const documentId = "00000000-0000-4000-8000-000000000301";

const fileObject: FileObject = {
  id: fileId,
  type: "document",
  filename: "folder/plan.pdf",
  mimeType: "application/pdf",
  bucketPath: "bucket/plan.pdf",
  projectId,
  workflowId: null,
  runId: null,
  vectorSearchable: false,
  topics: [],
  createdAt: "2026-07-16T08:00:00Z",
  updatedAt: "2026-07-16T08:00:00Z",
};

function dependencyHarness() {
  const calls: Array<{ name: string; input?: unknown }> = [];
  const examination: AosActivityDependencies["examination"] = {
    replaceAssessment: async (_projectId, input) => ({ nodesInserted: input.inserts.length }),
    replaceFundstellen: async (_projectId, input) => ({
      fundstellenInserted: input.inserts.length,
    }),
    listNodes: async () => ({ nodes: [] }),
    batchGetNodes: async () => ({ results: [] }),
    updateNodes: async (_projectId, input) => {
      calls.push({ name: "updateNodes", input });
      return { updated: [] };
    },
    getNormDeconstructions: async () => [],
    saveNormDeconstruction: async () => undefined,
  };
  const dependencies: AosActivityDependencies = {
    dms: {
      getZipFile: async () => ({
        ...fileObject,
        type: "zip",
        workflowStatus: "PENDING",
        approvalStatus: null,
      }),
      listFiles: async () => [fileObject],
      updateFileTopics: async (_id: string, topics: readonly string[]) => ({
        ...fileObject,
        topics: [...topics],
      }),
      uploadFile: async (input) => {
        calls.push({ name: "uploadFile", input });
        return fileObject;
      },
    },
    formal: {
      sendResults: async () => ({ sent: "formal" }),
      getResults: async () => ({ matchedDocumentTypes: [] }),
      getTemplateDocumentTypes: async () => [],
      sendTocResults: async () => ({ tocDocumentId: fileId }),
    },
    plausibility: { sendResults: async () => ({ sent: "plausibility" }) },
    examination,
    projectLogic: {
      listTopics: async () => [],
      listNodes: async () => ({ nodes: [] }),
      batchGetNodes: async () => ({ results: [] }),
    },
    fpp: {
      downloadSource: async () => new Uint8Array([4, 5, 6]),
    },
    fppFiles: {
      getFile: async (projectId, id) => ({
        id,
        projectId,
        projectVersion: 1,
        fileUrl: "https://stored.example.invalid/plan.zip",
        fileName: "plan.zip",
        fileType: "PLANUNTERLAGEN",
        dmsFileId: null,
        downloaded: false,
      }),
      confirmDownload: async () => undefined,
    },
  };
  return { calls, dependencies };
}

describe("FVP project files", () => {
  const withFiles = (files: FileObject[]) => {
    const { dependencies } = dependencyHarness();
    return { ...dependencies, dms: { ...dependencies.dms, listFiles: async () => files } };
  };

  test("reports an empty project as the NO_DOCUMENTS catalog error", async () => {
    const result = await listProjectFiles(withFiles([]).dms, projectId);

    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(EvlogError.isEvlogError(result.error)).toBe(true);
      expect(result.error.status).toBe(422);
    }
  });

  test("returns the NO_DOCUMENTS failure payload for an empty project", async () => {
    const activities = createAosActivities(withFiles([]));

    expect(await activities.listFvpProjectFiles(projectId)).toEqual({
      ok: false,
      failure: { code: "NO_DOCUMENTS", message: `No documents found for project ${projectId}` },
    });
  });

  test("returns the project files otherwise", async () => {
    const activities = createAosActivities(withFiles([fileObject]));

    expect(await activities.listFvpProjectFiles(projectId)).toEqual({ ok: true, value: [fileObject] });
  });

  test("keeps a DMS failure thrown so Temporal retries the activity", async () => {
    const { dependencies } = dependencyHarness();
    const activities = createAosActivities({
      ...dependencies,
      dms: {
        ...dependencies.dms,
        listFiles: async () => {
          throw new Error("DMS unavailable");
        },
      },
    });

    await expect(activities.listFvpProjectFiles(projectId)).rejects.toThrow("DMS unavailable");
  });
});

describe("AOS sequential slice activities", () => {
  test("replaces stale extraction roots atomically and skips fresh files", async () => {
    const { calls, dependencies } = dependencyHarness();
    dependencies.examination.listNodes = async () => ({
      nodes: [
        { nodeType: "dokument", id: documentId },
        {
          nodeType: "chunk",
          id: "old-chunk",
          parents: [{ nodeType: "dokument", id: documentId }],
        },
      ],
    });
    dependencies.examination.batchGetNodes = examinationReader({
      dokument: [
        nodeFixture("dokument", {
          nodeType: "dokument",
          id: documentId,
          dmsFileId: fileId,
          isOutdated: true,
          isTocDocument: true,
          markdownTextId: "old-markdown",
        }),
      ],
    });
    const activities = createAosActivities(dependencies);

    const result = await activities.batchInsertExtractionNodes({
      projectId: projectId,
      entries: [
        {
          dokumentId: documentId,
          sourceFileId: fileId,
          hasDokumentIdOverride: true,
          inserts: [
            {
              nodeType: "dokument",
              id: documentId,
              payload: { filename: "new.pdf" },
            },
            {
              nodeType: "chunk",
              id: "new-chunk",
              payload: { dokumentId: documentId },
            },
          ],
        },
      ],
    });

    expect(result.results).toEqual([{ dokumentId: documentId, skipped: false, nodesInserted: 2 }]);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.input).toEqual({
      inserts: [
        {
          nodeType: "chunk",
          id: "new-chunk",
          payload: { dokumentId: documentId },
        },
      ],
      updates: [
        {
          nodeType: "dokument",
          id: documentId,
          payload: { filename: "new.pdf", isOutdated: false, isTocDocument: false },
        },
      ],
      deletes: [
        { nodeType: "chunk", id: "old-chunk" },
        { nodeType: "markdown_text", id: "old-markdown" },
      ],
    });
  });

  test("discovers project norms stably and retains every topic reference", async () => {
    const { dependencies } = dependencyHarness();
    const topic = "00000000-0000-4000-8000-000000000501";
    const childTopic = "00000000-0000-4000-8000-000000000502";
    const first = "00000000-0000-4000-8000-000000000503";
    const second = "00000000-0000-4000-8000-000000000504";
    const third = "00000000-0000-4000-8000-000000000505";
    dependencies.projectLogic.listNodes = async () => ({
      nodes: [
        { nodeType: "topic", id: topic },
        {
          nodeType: "topic",
          id: childTopic,
          parents: [{ nodeType: "topic", id: topic }],
        },
        {
          nodeType: "topic_norm",
          id: first,
          parents: [{ nodeType: "topic", id: topic }],
        },
        {
          nodeType: "topic_norm",
          id: second,
          parents: [{ nodeType: "topic", id: childTopic }],
        },
        {
          nodeType: "topic_norm",
          id: third,
          parents: [{ nodeType: "topic", id: topic }],
        },
      ],
    });
    dependencies.projectLogic.batchGetNodes = projectReader({
      topicNorms: [
        nodeFixture("topicNorms", {
          id: first,
          nodeType: "topic_norm",
          topicId: topic,
          jurabk: "BNatSchG",
          paragraphNr: "§ 44",
        }),
        nodeFixture("topicNorms", {
          id: second,
          nodeType: "topic_norm",
          topicId: childTopic,
          jurabk: "BNatSchG",
          paragraphNr: "44",
        }),
        nodeFixture("topicNorms", {
          id: third,
          nodeType: "topic_norm",
          topicId: topic,
          jurabk: "BImSchG",
          paragraphNr: "5",
        }),
      ],
    });

    expect(createAosActivities(dependencies).fetchProjectNorms(projectId)).resolves.toEqual([
      {
        jurabk: "BNatSchG",
        paragraphNr: "§ 44",
        topicNorms: [
          {
            ownerNodeType: "topic",
            ownerNodeId: topic,
            topicNormId: first,
          },
          {
            ownerNodeType: "topic",
            ownerNodeId: childTopic,
            topicNormId: second,
          },
        ],
      },
      {
        jurabk: "BImSchG",
        paragraphNr: "5",
        topicNorms: [
          {
            ownerNodeType: "topic",
            ownerNodeId: topic,
            topicNormId: third,
          },
        ],
      },
    ]);
  });

  test("reports incumbent SuZ progress boundaries through the activity heartbeat seam", async () => {
    const { dependencies } = dependencyHarness();
    const gesetzId = "00000000-0000-4000-8000-000000000701";
    const normId = "00000000-0000-4000-8000-000000000702";
    const absatzId = "00000000-0000-4000-8000-000000000703";
    const satzId = "00000000-0000-4000-8000-000000000704";
    const tbmId = "00000000-0000-4000-8000-000000000705";
    const readNodes = examinationReader({
      gesetz: [
        nodeFixture("gesetz", {
          id: gesetzId,
          name: "Bundesnaturschutzgesetz",
          jurabk: "BNatSchG",
        }),
      ],
      norm: [nodeFixture("norm", { id: normId, gesetzId, paragraphNr: "44", paragraphTitel: "" })],
      absatz: [nodeFixture("absatz", { id: absatzId, normId, absatzNr: "1", text: "Absatztext" })],
      satz: [
        nodeFixture("satz", {
          id: satzId,
          absatzId,
          satzNr: "1",
          position: null,
          text: "Satztext",
          normTypLvl1: null,
          normTypLvl2: null,
          tatbestandsmerkmale: null,
        }),
      ],
      atomaresTbm: [nodeFixture("atomaresTbm", { id: tbmId, satzId, prueffrage: null })],
    });
    dependencies.examination.listNodes = async () => ({
      nodes: [
        { nodeType: "gesetz", id: gesetzId },
        {
          nodeType: "norm",
          id: normId,
          parents: [{ nodeType: "gesetz", id: gesetzId }],
        },
        { nodeType: "absatz", id: absatzId },
        { nodeType: "satz", id: satzId },
        { nodeType: "atomares_tbm", id: tbmId },
      ],
    });
    dependencies.examination.batchGetNodes = readNodes;
    const heartbeats: string[] = [];
    const activities = createAosActivities(dependencies, {
      heartbeat: (detail) => heartbeats.push(String(detail)),
    });

    expect(activities.fetchDocumentNodes({ projectId: projectId })).resolves.toEqual({
      documents: [],
      sources: [],
    });
    expect(
      activities.fetchNormExaminationIds({
        projectId: projectId,
        normId: normId,
      }),
    ).resolves.toMatchObject({
      gesetzId: gesetzId,
      satzIdLookup: { "1:1:0": satzId },
    });
    expect(
      activities.fetchNormData({ projectId: projectId, normId: normId }),
    ).resolves.toMatchObject({
      gesetz: "Bundesnaturschutzgesetz",
      jurabk: "BNatSchG",
      paragraphNr: "44",
    });
    expect(heartbeats).toEqual([
      "Resolved dokument nodes",
      "Resolved chunk nodes",
      "Resolved sub_chunk nodes",
      "Resolved markdown_text nodes",
      "Resolved absatz nodes",
      "Resolved satz nodes",
      "Resolved all norm hierarchy nodes",
    ]);
  });

  test("builds SuZ documents from nullable Examination page-index fields", async () => {
    const { dependencies } = dependencyHarness();
    const chunkId = "00000000-0000-4000-8000-000000000801";
    const subChunkId = "00000000-0000-4000-8000-000000000802";
    const markdownId = "00000000-0000-4000-8000-000000000803";
    const readNodes = examinationReader({
      dokument: [
        nodeFixture("dokument", { id: documentId, dmsFileId: fileId, filename: "plan.pdf" }),
      ],
      chunk: [
        nodeFixture("chunk", {
          id: chunkId,
          dokumentId: documentId,
          order: 1,
          pageIndexNodeId: null,
          pageIndexPosition: null,
          pageNumbers: [2],
          header: "Section",
          pageIndexSummary: null,
        }),
      ],
      subChunk: [
        nodeFixture("subChunk", { id: subChunkId, chunkId, order: 1, markdownTextId: markdownId }),
      ],
      markdownText: [nodeFixture("markdownText", { id: markdownId, text: "Body" })],
    });
    dependencies.examination.listNodes = async () => ({
      nodes: [
        { nodeType: "dokument", id: documentId },
        { nodeType: "chunk", id: chunkId },
        { nodeType: "sub_chunk", id: subChunkId },
        { nodeType: "markdown_text", id: markdownId },
      ],
    });
    dependencies.examination.batchGetNodes = readNodes;

    const activities = createAosActivities(dependencies, { heartbeat: () => undefined });

    expect((await activities.fetchDocumentNodes({ projectId })).documents).toEqual([
      {
        fileId,
        documentName: "plan.pdf",
        nodes: [
          {
            nodeId: chunkId,
            title: "Section",
            text: "Body",
            summary: "Section",
            chunkIds: [chunkId, subChunkId],
            pageNumbers: [2],
          },
        ],
      },
    ]);
  });
});

describe("FPP download activity", () => {
  const forged = {
    projectId,
    fileId,
    url: "https://forged.invalid/file.zip",
    fileName: "forged.zip",
    fileType: "forged",
  };

  test("rejects a foreign source before downloading or touching DMS", async () => {
    const { calls, dependencies } = dependencyHarness();
    let downloaded = false;
    dependencies.fppFiles.getFile = async () => {
      throw new Error("Foreign FPP source");
    };
    dependencies.fpp.downloadSource = async () => {
      downloaded = true;
      return new Uint8Array([1]);
    };

    await expect(createAosActivities(dependencies).downloadFppFile(forged)).rejects.toThrow(
      "Foreign FPP source",
    );
    expect(downloaded).toBe(false);
    expect(calls).toEqual([]);
  });

  test("downloads the persisted source and recovers a saved ZIP without downloading again", async () => {
    const { calls, dependencies } = dependencyHarness();
    const urls: string[] = [];
    const confirmed: string[] = [];
    dependencies.fpp.downloadSource = async (url) => {
      urls.push(url);
      return new Uint8Array([1]);
    };
    dependencies.fppFiles.confirmDownload = async (_projectId, _sourceId, dmsFileId) => {
      confirmed.push(dmsFileId);
    };

    await createAosActivities(dependencies).downloadFppFile(forged);

    expect(urls).toEqual(["https://stored.example.invalid/plan.zip"]);
    expect(calls).toContainEqual({
      name: "uploadFile",
      input: { projectId, filename: "plan.zip", type: "zip", bytes: new Uint8Array([1]) },
    });
    expect(confirmed).toHaveLength(1);

    const stored = dependencies.fppFiles.getFile;
    dependencies.fppFiles.getFile = async (project, source) => ({
      ...(await stored(project, source)),
      dmsFileId: fileId,
      downloaded: true,
    });
    const recovered = await createAosActivities(dependencies).downloadFppFile(forged);

    expect(recovered?.id).toBe(fileId);
    expect(urls).toHaveLength(1);
    expect(confirmed).toHaveLength(1);
  });

  test("does not restart a saved ZIP that document management already processed", async () => {
    const { dependencies } = dependencyHarness();
    const stored = dependencies.fppFiles.getFile;
    dependencies.fppFiles.getFile = async (project, source) => ({
      ...(await stored(project, source)),
      dmsFileId: fileId,
      downloaded: true,
    });
    dependencies.dms.getZipFile = async () => ({
      ...fileObject,
      type: "zip",
      workflowStatus: "COMPLETED",
      approvalStatus: "REQUIRES_APPROVAL",
    });

    await expect(createAosActivities(dependencies).downloadFppFile(forged)).rejects.toMatchObject({
      type: "FPP_ZIP_ALREADY_ADMITTED",
      nonRetryable: true,
    });
  });
});
