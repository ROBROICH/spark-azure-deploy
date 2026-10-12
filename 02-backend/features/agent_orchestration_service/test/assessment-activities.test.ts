import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { Client, Connection } from "@temporalio/client";
import { nodeDefinition } from "@spark-workflow/node-crud";
import { Value } from "@sinclair/typebox/value";
import {
  examinationReader,
  projectReader,
  afdReader,
  nodeFixture,
} from "./support/node-fixtures.ts";

import { administrativeFileDraftDescriptor } from "../../administrative_file_draft/src/node/descriptor.ts";
import {
  connectTemporalWorkflows,
  listWorkflowsByType,
} from "../../temporal_job_service/src/temporal/queries.ts";

import { SPARK_TEMPORAL_FIXTURE_FILE } from "@spark-temporal/typescript/caller";
import { runWithProjectContext } from "@spark-temporal/typescript/context";

import { parseAosCommandConfiguration } from "../src/env.ts";
import {
  createAssessmentActivities,
  type AssessmentActivityDependencies,
} from "../src/temporal/assessment-activities.ts";
import { AosTemporalCommandsService } from "../src/temporal/commands.ts";
import { type GraphInsert } from "../src/temporal/assessment-contracts.ts";

const ids = {
  project: "00000000-0000-4000-8000-000000000101",
  otherProject: "00000000-0000-4000-8000-000000000102",
  file: "00000000-0000-4000-8000-000000000103",
  satz: "00000000-0000-4000-8000-000000000104",
  bewertung: "00000000-0000-4000-8000-000000000105",
  markdown: "00000000-0000-4000-8000-000000000106",
  quelle: "00000000-0000-4000-8000-000000000107",
  document: "00000000-0000-4000-8000-000000000108",
  fundstelle: "00000000-0000-4000-8000-000000000109",
  topic: "00000000-0000-4000-8000-000000000110",
  hiddenTopic: "00000000-0000-4000-8000-000000000111",
  subtopic: "00000000-0000-4000-8000-000000000112",
  vae: "00000000-0000-4000-8000-000000000113",
  risk: "00000000-0000-4000-8000-000000000114",
  oldRisk: "00000000-0000-4000-8000-000000000115",
  be: "00000000-0000-4000-8000-000000000116",
  argument: "00000000-0000-4000-8000-000000000117",
} as const;

function dependencies(
  overrides: Partial<AssessmentActivityDependencies> = {},
): AssessmentActivityDependencies {
  return {
    examination: {
      async replaceAssessment(_projectId, input) {
        return { nodesInserted: input.inserts.length };
      },
      async listNodes() {
        return { nodes: [] };
      },
      async batchGetNodes() {
        return { results: [] };
      },
      async updateNodes() {
        return {};
      },
    },
    dms: {
      async getFileById(fileId) {
        return {
          id: fileId,
          type: "ewms_document",
          filename: "einwendung.pdf",
          mimeType: "application/pdf",
          bucketPath: "fixture/einwendung.pdf",
          projectId: ids.project,
          workflowId: null,
          runId: null,
          vectorSearchable: false,
          topics: [],
          createdAt: "2026-01-01T00:00:00Z",
          updatedAt: "2026-01-01T00:00:00Z",
        };
      },
    },
    projectLogic: {
      async listNodes() {
        return { nodes: [] };
      },
      async batchGetNodes() {
        return { results: [] };
      },
    },
    objections: {
      async listProcessedFileIds() {
        return [];
      },
      async storeExtractionResults() {
        return { results: [] };
      },
      async storeClassificationResults() {
        return { updatedCount: 0 };
      },
      async markClassificationFailed() {
        return { updatedCount: 0 };
      },
      async markInjectionDetected() {
        return { updatedCount: 0 };
      },
    },
    administrativeFileDraft: {
      async batchGetNodes() {
        return { results: [] };
      },
      async getRisks() {
        return [];
      },
      async updateNodes() {
        return {};
      },
    },
    suz: {
      async startAndAwait() {
        return { completed: true };
      },
    },
    ...overrides,
  };
}

describe("AOS assessment peer activities", () => {
  test.each([null, "open", "corrected", "ignored"] as const)(
    "inserts a new risk with status %s through the real risk schema",
    async (status) => {
      let insertedStatus: unknown;
      const activity = createAssessmentActivities(
        dependencies({
          administrativeFileDraft: {
            async batchGetNodes() {
              return { results: [] };
            },
            async getRisks() {
              return [];
            },
            async updateNodes(_projectId, mutation) {
              const [insert] = mutation.inserts ?? [];
              expect(insert).toBeDefined();
              const payload = Value.Parse(
                nodeDefinition(administrativeFileDraftDescriptor, "risks").schemas.insert,
                insert!.payload,
              );
              insertedStatus = payload.status;
              return { inserted: [{ id: insert!.id }], deleted: [] };
            },
          },
        }),
      );
      await activity._replace_vae_node_risks({
        projectId: ids.project,
        vaeNodeId: ids.vae,
        risks: [
          {
            id: ids.risk,
            vaeNodeId: ids.vae,
            problem: "Problem",
            severity: 4,
            implication: "Folge",
            recommendation: null,
            quote: null,
            status,
          },
        ],
      });
      expect(insertedStatus).toBe(status ?? "open");
    },
  );

  test("uses the exact SuZ start-and-await fixture without invoking Temporal", async () => {
    let liveCalls = 0;
    const heartbeats: string[] = [];
    const fixturePath = resolve(import.meta.dir, "../fixtures/assessment-temporal-outcomes.json");
    process.env[SPARK_TEMPORAL_FIXTURE_FILE] = fixturePath;
    try {
      const activity = createAssessmentActivities(
        dependencies({
          suz: {
            async startAndAwait() {
              liveCalls += 1;
              throw new Error("fixture mode must not invoke live Temporal");
            },
          },
        }),
        {
          heartbeat: (detail) => heartbeats.push(detail),
        },
      );

      await expect(
        runWithProjectContext(
          {
            projectId: "00000000-0000-4000-8000-000000006101",
            projectVersion: 7,
          },
          () =>
            activity.startAndAwaitSuz({
              projectId: "00000000-0000-4000-8000-000000006101",
              normId: "00000000-0000-4000-8000-000000006102",
            }),
        ),
      ).resolves.toBeUndefined();
      expect(liveCalls).toBe(0);
      expect(heartbeats).toEqual([
        "waiting for suche_zuordnung_norm-00000000-0000-4000-8000-000000006101-v7-00000000-0000-4000-8000-000000006102",
        "completed suche_zuordnung_norm-00000000-0000-4000-8000-000000006101-v7-00000000-0000-4000-8000-000000006102",
      ]);
    } finally {
      delete process.env[SPARK_TEMPORAL_FIXTURE_FILE];
    }
  });

  test("keeps heartbeating while a live SuZ callback is pending", async () => {
    delete process.env[SPARK_TEMPORAL_FIXTURE_FILE];
    const heartbeats: string[] = [];
    let completeSuz!: () => void;
    const suzCompletion = new Promise<void>((resolve) => {
      completeSuz = resolve;
    });
    const activity = createAssessmentActivities(
      dependencies({
        suz: {
          async startAndAwait() {
            await suzCompletion;
            return { completed: true };
          },
        },
      }),
      {
        heartbeat: (detail) => {
          heartbeats.push(detail);
          if (heartbeats.filter((value) => value.startsWith("waiting for ")).length === 2) {
            completeSuz();
          }
        },
        heartbeatIntervalMs: 1,
      },
    );

    await runWithProjectContext({ projectId: ids.project, projectVersion: 1 }, () =>
      activity.startAndAwaitSuz({
        projectId: ids.project,
        normId: "00000000-0000-4000-8000-000000006102",
      }),
    );

    expect(heartbeats.filter((detail) => detail.startsWith("waiting for ")).length).toBeGreaterThan(
      1,
    );
    expect(heartbeats.at(-1)).toStartWith("completed ");
  });

  test("makes a failed SuZ wait nonretryable", async () => {
    delete process.env[SPARK_TEMPORAL_FIXTURE_FILE];
    const activity = createAssessmentActivities(
      dependencies({
        suz: {
          async startAndAwait() {
            throw new Error("recorded SuZ failure");
          },
        },
      }),
      { heartbeat: () => {} },
    );

    await expect(
      runWithProjectContext({ projectId: ids.project, projectVersion: 1 }, () =>
        activity.startAndAwaitSuz({
          projectId: ids.project,
          normId: "00000000-0000-4000-8000-000000006102",
        }),
      ),
    ).rejects.toMatchObject({
      type: "SuzWorkflowFailed",
      nonRetryable: true,
    });
  });

  test("validates every EWMS file against both project ownership and file type", async () => {
    const activity = createAssessmentActivities(
      dependencies({
        dms: {
          async getFileById(fileId) {
            return {
              id: fileId,
              type: "document",
              filename: "wrong.pdf",
              mimeType: "application/pdf",
              bucketPath: "fixture/wrong.pdf",
              projectId: ids.otherProject,
              workflowId: null,
              runId: null,
              vectorSearchable: false,
              topics: [],
              createdAt: "2026-01-01T00:00:00Z",
              updatedAt: "2026-01-01T00:00:00Z",
            };
          },
        },
      }),
    );

    expect(
      activity._fetch_ewms_documents({
        projectId: ids.project,
        fileIds: [ids.file],
      }),
    ).rejects.toThrow(`not EWMS documents for project ${ids.project}: ${ids.file}`);
  });

  test("returns only visible topics and visible owned subtopics", async () => {
    const activity = createAssessmentActivities(
      dependencies({
        projectLogic: {
          async listNodes() {
            return {
              nodes: [
                { nodeType: "topic", id: ids.topic },
                { nodeType: "topic", id: ids.hiddenTopic },
                {
                  nodeType: "subtopic",
                  id: ids.subtopic,
                  parents: [{ nodeType: "topic", id: ids.topic }],
                },
              ],
            };
          },
          batchGetNodes: projectReader({
            topics: [
              nodeFixture("topics", {
                id: ids.topic,
                name: "Verkehr",
                description: null,
                showInEwm: true,
              }),
              nodeFixture("topics", {
                id: ids.hiddenTopic,
                name: "Intern",
                description: "hidden",
                showInEwm: false,
              }),
            ],
            subtopics: [
              nodeFixture("subtopics", {
                id: ids.subtopic,
                topicId: ids.topic,
                name: "Lärm",
                description: "Schall",
                showInEwm: true,
              }),
            ],
          }),
        },
      }),
    );

    expect(await activity._fetch_argument_topics(ids.project)).toEqual([
      {
        topicId: ids.topic,
        name: "Verkehr",
        description: "",
        subtopics: [
          {
            topicId: ids.subtopic,
            name: "Lärm",
            description: "Schall",
          },
        ],
      },
    ]);
  });

  test("enriches extraction payloads and maps classified and unclassified arguments", async () => {
    const stored: unknown[] = [];
    const activity = createAssessmentActivities(
      dependencies({
        objections: {
          async listProcessedFileIds() {
            return [];
          },
          async storeExtractionResults(_projectId, value) {
            stored.push(value);
            return { results: [] };
          },
          async storeClassificationResults(_projectId, value) {
            stored.push(value);
            return { updatedCount: 0 };
          },
          async markClassificationFailed() {
            return { updatedCount: 0 };
          },
          async markInjectionDetected() {
            return { updatedCount: 0 };
          },
        },
      }),
    );
    const extractedArgument = {
      argument: { text: "A", span: { startIdx: 0, endIdx: 1 } },
      description: "D",
      context: { text: "A", span: { startIdx: 0, endIdx: 1 } },
    };

    await activity._store_extraction_results({
      projectId: ids.project,
      extractionOutput: {
        documentArguments: [
          {
            documentId: ids.file,
            chunkArguments: [
              {
                chunk: {
                  chunkId: crypto.randomUUID(),
                  pageContent: "A",
                  pageNumbers: [1],
                },
                arguments: [extractedArgument],
              },
            ],
          },
        ],
      },
      documentNamesById: { [ids.file]: "einwendung.pdf" },
      markdownById: { [ids.file]: "# Einwendung" },
    });
    await activity._store_classification_results({
      projectId: ids.project,
      classificationOutput: {
        classifiedArguments: [
          {
            argumentRecord: {
              argumentId: ids.argument,
              extractedArgument: extractedArgument,
            },
            topic: {
              topicId: ids.topic,
              name: "Verkehr",
              description: "",
              subtopics: [],
            },
            subtopic: null,
            reasoning: "passt",
            confidence: 0.9,
            topicConfidence: 0.9,
            subtopicConfidence: null,
          },
          {
            argumentRecord: {
              argumentId: ids.oldRisk,
              extractedArgument: extractedArgument,
            },
            topic: null,
            subtopic: null,
            reasoning: "kein Thema",
            confidence: 0.2,
            topicConfidence: null,
            subtopicConfidence: null,
          },
        ],
      },
    });

    expect(stored[0]).toMatchObject({
      documentArguments: [
        {
          documentId: ids.file,
          documentName: "einwendung.pdf",
          beteiligungsEingangMarkdown: "# Einwendung",
        },
      ],
    });
    expect(stored[1]).toEqual({
      classifiedArguments: [
        {
          argumentId: ids.argument,
          topicId: ids.topic,
          subTopicId: null,
          topicConfidence: 0.9,
          subTopicConfidence: null,
        },
      ],
      unclassifiedArgumentIds: [ids.oldRisk],
    });
  });

  test.each(["fundstelle", "dokument"])(
    "keeps stale %s evidence out of assessment input",
    async (staleType) => {
      const nodes = [
        nodeFixture("gesetz", { id: "law" }),
        nodeFixture("norm", { id: "norm", gesetzId: "law" }),
        nodeFixture("absatz", { id: "paragraph", normId: "norm" }),
        nodeFixture("satz", { id: ids.satz, absatzId: "paragraph" }),
        nodeFixture("dokument", { id: ids.document, isOutdated: staleType === "dokument" }),
        nodeFixture("fundstelle", {
          id: ids.fundstelle,
          satzId: ids.satz,
          dokumentId: ids.document,
          text: "superseded evidence",
          isOutdated: staleType === "fundstelle",
        }),
      ];
      const base = dependencies();
      const activity = createAssessmentActivities({
        ...base,
        examination: {
          ...base.examination,
          listNodes: async () => ({ nodes: nodes.map(({ id, nodeType }) => ({ id, nodeType })) }),
          batchGetNodes: examinationReader({
            gesetz: [nodes[0] as ReturnType<typeof nodeFixture<"gesetz">>],
            norm: [nodes[1] as ReturnType<typeof nodeFixture<"norm">>],
            absatz: [nodes[2] as ReturnType<typeof nodeFixture<"absatz">>],
            satz: [nodes[3] as ReturnType<typeof nodeFixture<"satz">>],
            dokument: [nodes[4] as ReturnType<typeof nodeFixture<"dokument">>],
            fundstelle: [nodes[5] as ReturnType<typeof nodeFixture<"fundstelle">>],
          }),
        },
      });
      const context = await activity.gatherNormContext({ projectId: ids.project, normId: "norm" });
      expect(context.saetze[0]?.fundstellen).toEqual([]);
      expect(context.saetze[0]?.needsRefresh).toBe(true);
    },
  );

  test("nulls a missing optional Fundstelle before writing Bewertung sources", async () => {
    const writes: Array<
      Parameters<AssessmentActivityDependencies["examination"]["updateNodes"]>[1]
    > = [];
    const examination: AssessmentActivityDependencies["examination"] = {
      async listNodes() {
        return { nodes: [{ nodeType: "dokument", id: ids.document }] };
      },
      batchGetNodes: examinationReader({}),
      async updateNodes() {
        return {};
      },
      async replaceAssessment(_projectId, input) {
        writes.push({ inserts: input.inserts });
        return { nodesInserted: input.inserts.length };
      },
    };
    const activity = createAssessmentActivities(dependencies({ examination }));
    const inserts: GraphInsert[] = [
      {
        nodeType: "markdown_text",
        id: ids.markdown,
        payload: { text: "# Bewertung" },
      },
      {
        nodeType: "bewertung",
        id: ids.bewertung,
        payload: {
          satzId: ids.satz,
          result: "erfuellt",
          kurzform: null,
          norm: "§ 1",
          markdownTextId: ids.markdown,
        },
      },
      {
        nodeType: "bewertung_quelle",
        id: ids.quelle,
        payload: {
          bewertungId: ids.bewertung,
          dokumentId: ids.document,
          fundstelleId: ids.fundstelle,
          title: "Quelle",
          chunkIds: [],
          pageNumbers: [],
        },
      },
      {
        nodeType: "bewertung_quelle",
        id: "missing-source",
        payload: {
          bewertungId: ids.bewertung,
          dokumentId: "missing-document",
          fundstelleId: null,
          title: "Missing",
          chunkIds: [],
          pageNumbers: [],
        },
      },
    ];

    const result = await activity.writeBewertungSatzResult({
      projectId: ids.project,
      satzId: ids.satz,
      bewertungId: ids.bewertung,
      sources: [],
      inserts,
    });

    expect(result).toEqual({
      satzId: ids.satz,
      bewertungId: ids.bewertung,
      nodesInserted: 3,
      skipped: false,
    });
    expect(writes).toHaveLength(1);
    const writtenInserts = writes[0]?.inserts as GraphInsert[];
    expect(
      writtenInserts.flatMap((insert) =>
        insert.nodeType === "bewertung_quelle" ? [insert.payload.fundstelleId] : [],
      ),
    ).toEqual([null]);
    expect(
      writtenInserts.filter(({ nodeType }) => nodeType === "bewertung_quelle").map(({ id }) => id),
    ).toEqual([ids.quelle]);
  });

  test("reads a chapter from a full Administrative File Draft node payload", async () => {
    const activity = createAssessmentActivities(
      dependencies({
        administrativeFileDraft: {
          batchGetNodes: afdReader({
            vaeNodes: [
              nodeFixture("vaeNodes", {
                id: ids.vae,
                title: "1.1 Umwelt",
                text: "Flora & Fauna bleiben geschützt.",
                isHidden: false,
              }),
            ],
          }),
          async getRisks() {
            return [];
          },
          async updateNodes() {
            return {};
          },
        },
      }),
    );

    expect(
      await activity._fetch_risikohinweis_chapter({
        projectId: ids.project,
        vaeNodeId: ids.vae,
      }),
    ).toEqual({
      id: ids.vae,
      title: "1.1 Umwelt",
      text: "Flora & Fauna bleiben geschützt.",
    });
  });

  test("suppresses hidden or blank VAE chapters", async () => {
    const activity = createAssessmentActivities(
      dependencies({
        administrativeFileDraft: {
          batchGetNodes: afdReader({
            vaeNodes: [
              nodeFixture("vaeNodes", {
                id: ids.vae,
                title: "1.1 Umwelt",
                text: "   ",
                isHidden: false,
              }),
            ],
          }),
          async getRisks() {
            return [];
          },
          async updateNodes() {
            return {};
          },
        },
      }),
    );

    expect(
      await activity._fetch_risikohinweis_chapter({
        projectId: ids.project,
        vaeNodeId: ids.vae,
      }),
    ).toBeNull();
  });

  test("carries status forward while replacing only the target VAE risks", async () => {
    let persistedMutation:
      | Parameters<AssessmentActivityDependencies["administrativeFileDraft"]["updateNodes"]>[1]
      | undefined;
    const activity = createAssessmentActivities(
      dependencies({
        administrativeFileDraft: {
          async batchGetNodes() {
            return { results: [] };
          },
          async getRisks() {
            return [
              { id: ids.risk, vaeNodeId: ids.vae, status: "corrected" },
              { id: ids.oldRisk, vaeNodeId: ids.vae, status: "open" },
              {
                id: ids.document,
                vaeNodeId: ids.otherProject,
                status: "open",
              },
            ];
          },
          async updateNodes(_projectId, mutation) {
            persistedMutation = mutation;
            return {
              deleted: [{ id: ids.risk }, { id: ids.oldRisk }],
              inserted: [{ id: ids.risk }],
            };
          },
        },
      }),
    );

    const result = await activity._replace_vae_node_risks({
      projectId: ids.project,
      vaeNodeId: ids.vae,
      risks: [
        {
          id: ids.risk,
          vaeNodeId: ids.vae,
          problem: "Problem",
          recommendation: null,
          quote: null,
          severity: 5,
          implication: "Folge",
          status: null,
        },
      ],
    });

    expect(result).toEqual({ deletedCount: 2, insertedCount: 1 });
    expect(persistedMutation?.inserts).toEqual([
      {
        nodeType: "risks",
        id: ids.risk,
        payload: {
          vaeNodeId: ids.vae,
          problem: "Problem",
          severity: 5,
          implication: "Folge",
          recommendation: null,
          quote: null,
          status: "corrected",
        },
      },
    ]);
    const deletedIds = persistedMutation?.deletes?.map(({ id }) => id) ?? [];
    expect(deletedIds).toContain(ids.risk);
    expect(deletedIds).toContain(ids.oldRisk);
    expect(deletedIds).not.toContain(ids.document);
  });

  test("does not rewrite an exact retained risk ID set", async () => {
    const writes: unknown[] = [];
    const activity = createAssessmentActivities(
      dependencies({
        administrativeFileDraft: {
          async batchGetNodes() {
            return { results: [] };
          },
          async getRisks() {
            return [{ id: ids.risk, vaeNodeId: ids.vae, status: "open" }];
          },
          async updateNodes(_projectId, mutation) {
            writes.push(mutation);
            return {};
          },
        },
      }),
    );

    expect(
      activity._replace_vae_node_risks({
        projectId: ids.project,
        vaeNodeId: ids.vae,
        risks: [
          {
            id: ids.risk,
            vaeNodeId: ids.vae,
            problem: "Already retained",
            recommendation: null,
            quote: null,
            severity: 3,
            implication: "No replacement required",
            status: null,
          },
        ],
      }),
    ).resolves.toEqual({ deletedCount: 0, insertedCount: 1 });
    expect(writes).toEqual([]);
  });
});

const temporalAddress = process.env.AOS_TEMPORAL_TEST_ADDRESS;
const temporalNamespace = process.env.AOS_TEMPORAL_TEST_NAMESPACE;

describe.skipIf(temporalAddress === undefined || temporalNamespace === undefined)(
  "native SuZ start visibility",
  () => {
    test("an assessment-started SuZ is visible to the exact project status read while it runs", async () => {
      delete process.env[SPARK_TEMPORAL_FIXTURE_FILE];
      const projectId = randomUUID();
      const normId = randomUUID();
      const projectVersion = 3;
      const workflowId = `suche_zuordnung_norm-${projectId}-v${projectVersion}-${normId}`;
      const commands = new AosTemporalCommandsService(
        parseAosCommandConfiguration({
          TEMPORAL_HOST: temporalAddress,
          TEMPORAL_NAMESPACE: temporalNamespace,
        }),
      );
      const workflows = connectTemporalWorkflows({
        temporalHost: temporalAddress!,
        temporalNamespace: temporalNamespace!,
        payloadStorage: null,
      });
      const connection = await Connection.connect({ address: temporalAddress });
      const client = new Client({ connection, namespace: temporalNamespace });
      let startedId: string | undefined;
      const activity = createAssessmentActivities(
        dependencies({
          suz: {
            startAndAwait: (command) => {
              startedId = command.executionId;
              return commands.startAndAwaitSuz(command);
            },
          },
        }),
        { heartbeat: () => {} },
      );
      const waiting = runWithProjectContext({ projectId, projectVersion }, () =>
        activity.startAndAwaitSuz({ projectId, normId }),
      ).catch((error) => error);
      const read = () =>
        listWorkflowsByType(workflows, {
          projectId,
          projectVersion,
          workflowType: "suche_zuordnung_norm",
          workflowId,
          executionStatus: "Running",
          pageSize: 1,
          nextPageToken: null,
        });
      try {
        const deadline = Date.now() + 30_000;
        let page = await read();
        while (page.workflows.length === 0 && Date.now() < deadline) {
          await delay(100);
          page = await read();
        }
        expect(page.workflows).toMatchObject([
          { workflowId, projectId, projectVersion, status: "running" },
        ]);
      } finally {
        try {
          if (startedId !== undefined) {
            await client.workflow
              .getHandle(startedId)
              .terminate("SuZ visibility regression complete");
            await waiting;
          }
        } finally {
          await Promise.all([commands.close(), workflows.close(), connection.close()]);
        }
      }
    }, 60_000);
  },
);
