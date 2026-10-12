import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { HttpJson } from "@spark-workflow/http-host";

import { ProcessedFileIdsResponseSchema } from "../../src/schemas.ts";
import {
  ArgumentExtractionResponseSchema,
  CountResponseSchema,
  NodeMutationResponseSchema,
  parseMutationContract,
} from "../support/mutation-contracts.ts";
import {
  assertProjectsAbsent,
  cleanupProjects,
  createMutationDatabase,
  readProjectState,
  seedCoreProjectVersion,
  setCoreVersionLock,
  type MutationDatabase,
} from "../support/mutation-database.ts";
import { mutateJson, mutationRequest } from "../support/mutation-http.ts";

const describeMutationTests =
  process.env.OBJECTIONS_MUTATION_BASE_URL === undefined ||
  process.env.OBJECTIONS_MUTATION_DATABASE_URL === undefined
    ? describe.skip
    : describe;

const AUDIT_HEADERS = {
  "X-Actor-User-Id": "72000000-0000-4000-8000-000000000001",
  "X-Triggered-By-User-Id": "72000000-0000-4000-8000-000000000002",
  "X-Workflow-Run-Id": "objections-mutation-test-run",
  "X-Workflow-Type": "ObjectionsMutationTest",
  "X-Request-Id": "objections-mutation-test-request",
  "X-Request-Starttime": "2026-07-17T01:02:03.456Z",
};

const extractionDocument = (documentId: string) => ({
  documentId,
  documentName: "folder/S-objection.pdf",
  chunkArguments: [
    {
      chunk: {
        chunkId: `chunk-${documentId}`,
        pageContent: "Page content",
        pageNumbers: [1],
      },
      arguments: [
        {
          argument: { text: "An objection", span: { startIdx: 0, endIdx: 12 } },
          description: "Extracted objection",
          context: { text: "Context", span: { startIdx: 0, endIdx: 7 } },
        },
      ],
    },
  ],
  beteiligungsEingangMarkdown: "# Objection",
});

describeMutationTests("Objections local-resource HTTP mutations", () => {
  let database: MutationDatabase;

  beforeAll(async () => {
    database = createMutationDatabase();
    await database.ready();
  });

  afterAll(async () => {
    await database.close();
  });

  test("stores extraction and classification and resolves the latest version locally", async () => {
    const projectId = crypto.randomUUID();
    const fileId = crypto.randomUUID();
    const topicId = crypto.randomUUID();
    await assertProjectsAbsent(database, [projectId]);
    await seedCoreProjectVersion(database, projectId, 1);

    try {
      const extraction = await mutateJson(
        `/${projectId}/ewms/argument-extraction?projectVersion=1`,
        mutationRequest(
          "POST",
          { documentArguments: [extractionDocument(fileId)] },
          AUDIT_HEADERS,
        ),
      );
      expect(extraction.status).toBe(200);
      const extracted = parseMutationContract(ArgumentExtractionResponseSchema, extraction.body);
      const argumentId = extracted.results[0]?.arguments[0]?.argumentId;
      expect(argumentId).toBeString();

      const classification = await mutateJson(
        `/${projectId}/ewms/classification?projectVersion=1`,
        mutationRequest(
          "PATCH",
          {
            classifiedArguments: [
              {
                argumentId,
                topicId,
                subTopicId: null,
                topicConfidence: 0.8,
                subTopicConfidence: null,
              },
            ],
            unclassifiedArgumentIds: [],
          },
          AUDIT_HEADERS,
        ),
      );
      expect(classification.status).toBe(200);
      expect(parseMutationContract(CountResponseSchema, classification.body)).toEqual({
        updatedCount: 1,
      });

      const processed = await mutateJson(
        `/${projectId}/ewms/processed-file-ids`,
        mutationRequest("GET"),
      );
      expect(processed.status).toBe(200);
      expect(
        parseMutationContract(ProcessedFileIdsResponseSchema, processed.body).fileIds,
      ).toEqual([fileId]);

      const state = await readProjectState(database, projectId);
      expect(state.arguments.find(({ id }) => id === argumentId)).toMatchObject({
        topicId,
        topicConfidence: 0.8,
      });
      expect(state.entries[0]).toMatchObject({
        fileId,
        classificationStatus: "done",
      });
    } finally {
      await cleanupProjects(database, [projectId]);
    }
    await assertProjectsAbsent(database, [projectId]);
  });

  test("audits only the arguments and entries a classification changed", async () => {
    const projectId = crypto.randomUUID();
    const foreignProjectId = crypto.randomUUID();
    const missingId = crypto.randomUUID();
    await assertProjectsAbsent(database, [projectId, foreignProjectId]);
    await seedCoreProjectVersion(database, projectId, 1);
    await seedCoreProjectVersion(database, foreignProjectId, 1);

    try {
      const extract = async (targetProjectId: string) => {
        const response = await mutateJson(
          `/${targetProjectId}/ewms/argument-extraction?projectVersion=1`,
          mutationRequest(
            "POST",
            { documentArguments: [extractionDocument(crypto.randomUUID())] },
            AUDIT_HEADERS,
          ),
        );
        expect(response.status).toBe(200);
        const [result] = parseMutationContract(
          ArgumentExtractionResponseSchema,
          response.body,
        ).results;
        const [argument] = result?.arguments ?? [];
        if (result === undefined || argument === undefined) {
          throw new Error("Argument extraction stored no argument");
        }
        return { argumentId: argument.argumentId, entryId: result.beteiligungsEingangId };
      };
      const own = await extract(projectId);
      const foreign = await extract(foreignProjectId);
      const changes = async (path: string, body: HttpJson) => {
        const before = (await readProjectState(database, projectId)).audit.length;
        const response = await mutateJson(
          `/${projectId}/ewms/${path}?projectVersion=1`,
          mutationRequest("PATCH", body, AUDIT_HEADERS),
        );
        expect(response.status).toBe(200);
        return (await readProjectState(database, projectId)).audit
          .slice(before)
          .map(({ entityType, entityId, changeType }) => ({ entityType, entityId, changeType }))
          .sort((left, right) => left.entityType.localeCompare(right.entityType));
      };
      const classified = (argumentId: string) => ({
        argumentId,
        topicId: crypto.randomUUID(),
      });

      expect(
        await changes("classification", {
          classifiedArguments: [classified(foreign.argumentId), classified(missingId)],
          unclassifiedArgumentIds: [foreign.argumentId, missingId],
        }),
      ).toEqual([]);
      expect(
        await changes("classification-failed", {
          beteiligungsEingangIds: [foreign.entryId, missingId],
        }),
      ).toEqual([]);
      expect(
        await changes("classification", {
          classifiedArguments: [
            classified(own.argumentId),
            classified(foreign.argumentId),
            classified(missingId),
          ],
          unclassifiedArgumentIds: [foreign.argumentId, missingId],
        }),
      ).toEqual([
        { entityType: "argument", entityId: own.argumentId, changeType: "update" },
        { entityType: "beteiligungs_eingang", entityId: own.entryId, changeType: "update" },
      ]);
    } finally {
      await cleanupProjects(database, [projectId, foreignProjectId]);
    }
    await assertProjectsAbsent(database, [projectId, foreignProjectId]);
  });

  test("uses core project writes and rejects node mutations under an active version lock", async () => {
    const projectId = crypto.randomUUID();
    const firstEntryId = crypto.randomUUID();
    const lockedEntryId = crypto.randomUUID();
    await assertProjectsAbsent(database, [projectId]);
    await seedCoreProjectVersion(database, projectId, 1);

    const nodeBody = (id: string) => ({
      inserts: [
        {
          nodeType: "beteiligungs_eingang",
          id,
          payload: {
            fileId: crypto.randomUUID(),
            extractionStatus: "success",
          },
        },
      ],
      updates: [],
      deletes: [],
    });

    try {
      const inserted = await mutateJson(
        `/${projectId}/update?projectVersion=1`,
        mutationRequest("POST", nodeBody(firstEntryId), AUDIT_HEADERS),
      );
      expect(inserted.status).toBe(200);
      expect(
        parseMutationContract(NodeMutationResponseSchema, inserted.body).inserted[0],
      ).toMatchObject({
        id: firstEntryId,
      });

      await setCoreVersionLock(database, projectId, {
        sourceVersion: 1,
        targetVersion: 2,
        lockToken: `lock-${crypto.randomUUID()}`,
      });
      const beforeLockedWrite = await readProjectState(database, projectId);
      const locked = await mutateJson(
        `/${projectId}/update?projectVersion=1`,
        mutationRequest("POST", nodeBody(lockedEntryId), AUDIT_HEADERS),
      );
      expect(locked.status).toBe(409);
      expect(await readProjectState(database, projectId)).toEqual(beforeLockedWrite);
    } finally {
      await cleanupProjects(database, [projectId]);
    }
    await assertProjectsAbsent(database, [projectId]);
  });
});
