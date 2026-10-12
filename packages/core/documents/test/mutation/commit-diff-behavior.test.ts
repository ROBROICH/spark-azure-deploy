import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { fileTopics, files, zipFileDiffEntries, zipFiles } from "../../src/db/schema.ts";
import {
  CommitDiffResponseSchema,
  FileDiffSchema,
  parseMutationContract,
} from "../support/mutation-contracts.ts";
import {
  assertMutationProjectsAbsent,
  cleanupMutationProjects,
  createMutationDatabase,
  readMutationProjectState,
  seedMutationProjects,
  setMutationProjectLock,
  type MutationDatabase,
} from "../support/mutation-database.ts";
import { mutateJson, mutationRequest } from "../support/mutation-http.ts";
import {
  assertMutationObjectsAbsent,
  cleanupMutationObjects,
  createMutationStorage,
  putMutationObject,
  readMutationObject,
  type MutationStorage,
} from "../support/mutation-storage.ts";
const commitQualification =
  process.env.DMS_MUTATION_BASE_URL === undefined ? describe.skip : describe;

const nodeValues = (projectId: string, projectVersion: number) => ({
  projectId,
  projectVersion,
  createdAt: new Date("2026-07-17T08:00:00.000Z"),
  updatedAt: new Date("2026-07-17T08:00:00.000Z"),
  sysPeriod: '["2026-07-17 08:00:00+00",)',
  isDeleted: false,
  isOutdated: false,
  frontendParentIds: [] as string[],
  updateType: "AUTOMATED" as const,
});

const fileRow = (
  projectId: string,
  projectVersion: number,
  input: Partial<typeof files.$inferInsert> &
    Pick<typeof files.$inferInsert, "id" | "type" | "filename" | "bucketPath">,
): typeof files.$inferInsert => ({
  ...nodeValues(projectId, projectVersion),
  mimeType: input.type === "CONTENT_EXTRACTION" ? "application/json" : "application/pdf",
  version: 1,
  addedInVersion: projectVersion,
  workflowId: null,
  runId: null,
  vectorSearchable: false,
  sourceZipFileId: null,
  workflowStatus: "COMPLETED",
  ...input,
});

async function cleanupScenario(
  database: MutationDatabase,
  storage: MutationStorage,
  projectIds: readonly string[],
  objects: ReadonlyArray<{ bucket: "clean" | "quarantine"; path: string }>,
): Promise<void> {
  const actions = [
    () => cleanupMutationProjects(database, projectIds),
    () => cleanupMutationObjects(storage, objects),
    () => assertMutationProjectsAbsent(database, projectIds),
    () => assertMutationObjectsAbsent(storage, objects),
  ];
  const failures: Error[] = [];
  for (const action of actions) {
    try {
      await action();
    } catch (error) {
      failures.push(error instanceof Error ? error : new Error(String(error)));
    }
  }
  if (failures.length > 0) throw new AggregateError(failures, "commit-diff cleanup failed");
}

commitQualification("Document Management complete diff commit behavior", () => {
  let database: MutationDatabase;
  let storage: MutationStorage;

  beforeAll(async () => {
    database = createMutationDatabase();
    storage = createMutationStorage();
  });

  afterAll(async () => {
    await database.client.close();
  });

  test("carries summary, EWMS, unchanged processed JSON, renamed processed JSON, and topics", async () => {
    const projectId = crypto.randomUUID();
    const zipId = crypto.randomUUID();
    const unchangedId = crypto.randomUUID();
    const renamedId = crypto.randomUUID();
    const summaryId = crypto.randomUUID();
    const ewmsId = crypto.randomUUID();
    const unchangedProcessedId = crypto.randomUUID();
    const renamedProcessedId = crypto.randomUUID();
    const topicId = crypto.randomUUID();
    const oldProcessedName = "folder/old/old_processed.json";
    const newProcessedName = "folder/new/new_processed.json";

    try {
      await seedMutationProjects(database, [{ id: projectId, projectVersion: 1 }]);
      await setMutationProjectLock(database, {
        projectId,
        sourceVersion: 1,
        targetVersion: 2,
        lockToken: "carry-forward-lock",
      });
      await database.db.insert(zipFiles).values({
        id: zipId,
        ...nodeValues(projectId, 1),
        filename: "carry-forward.zip",
        bucketPath: `zips/${projectId}/v1/carry-forward.zip`,
        type: "ZIP",
        workflowStatus: "COMPLETED",
        approvalStatus: "APPROVED",
        approvalError: null,
        sourceProjectVersion: 1,
      });
      await database.db.insert(files).values([
        fileRow(projectId, 1, {
          id: unchangedId,
          type: "DOCUMENT",
          filename: "unchanged.pdf",
          bucketPath: `documents/${projectId}/v1/unchanged.pdf`,
        }),
        fileRow(projectId, 1, {
          id: renamedId,
          type: "DOCUMENT",
          filename: "folder/old.pdf",
          bucketPath: `documents/${projectId}/v1/folder/old.pdf`,
        }),
        fileRow(projectId, 1, {
          id: summaryId,
          type: "CONTENT_EXTRACTION",
          filename: "summary.json",
          bucketPath: `content_extraction/${projectId}/v1/summary.json`,
        }),
        fileRow(projectId, 1, {
          id: ewmsId,
          type: "EWMS_DOCUMENT",
          filename: "ewms.xml",
          bucketPath: `ewms/${projectId}/files/v1/ewms.xml`,
        }),
        fileRow(projectId, 1, {
          id: unchangedProcessedId,
          type: "CONTENT_EXTRACTION",
          filename: "unchanged/unchanged_processed.json",
          bucketPath: `content_extraction/${projectId}/v1/unchanged/unchanged_processed.json`,
        }),
        fileRow(projectId, 1, {
          id: renamedProcessedId,
          type: "CONTENT_EXTRACTION",
          filename: oldProcessedName,
          bucketPath: `content_extraction/${projectId}/v1/${oldProcessedName}`,
        }),
      ]);
      await database.db.insert(fileTopics).values({
        id: topicId,
        ...nodeValues(projectId, 1),
        fileId: unchangedId,
        topicId: crypto.randomUUID(),
        subtopicId: null,
      });
      await database.db.insert(zipFileDiffEntries).values([
        {
          id: crypto.randomUUID(),
          zipFileId: zipId,
          projectVersion: 1,
          entryKey: unchangedId,
          computedKind: "unchanged",
          decisionKind: "unchanged",
          fileId: unchangedId,
          filename: "unchanged.pdf",
          oldName: null,
          newName: null,
          bucketPath: null,
          sourceSha: null,
          targetSha: null,
          sha: "unchanged-sha",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: crypto.randomUUID(),
          zipFileId: zipId,
          projectVersion: 1,
          entryKey: renamedId,
          computedKind: "renamed",
          decisionKind: "renamed",
          fileId: renamedId,
          filename: "folder/new.pdf",
          oldName: "folder/old.pdf",
          newName: "folder/new.pdf",
          bucketPath: null,
          sourceSha: null,
          targetSha: null,
          sha: "renamed-sha",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const body = {
        sourceVersion: 1,
        targetVersion: 2,
        lockToken: "carry-forward-lock",
        dryRun: false,
      };
      for (const _run of [1, 2]) {
        const response = await mutateJson(
          `/v2/internal/files/${projectId}/zips/${zipId}/commit-diff`,
          mutationRequest("POST", body),
        );
        expect(response.status).toBe(200);
        expect(parseMutationContract(CommitDiffResponseSchema, response.body)).toEqual({
          dryRun: false,
          new: 0,
          changed: 0,
          renamed: 1,
          unchanged: 1,
        });
      }

      const state = await readMutationProjectState(database, projectId);
      const target = state.files.filter(({ projectVersion }) => projectVersion === 2);
      expect(target).toHaveLength(6);
      expect(target.find(({ id }) => id === unchangedId)?.filename).toBe("unchanged.pdf");
      expect(target.find(({ id }) => id === renamedId)?.filename).toBe("folder/new.pdf");
      expect(target.find(({ id }) => id === summaryId)?.filename).toBe("summary.json");
      expect(target.find(({ id }) => id === ewmsId)?.type).toBe("EWMS_DOCUMENT");
      expect(target.find(({ id }) => id === unchangedProcessedId)?.filename).toBe(
        "unchanged/unchanged_processed.json",
      );
      expect(target.find(({ id }) => id === renamedProcessedId)?.filename).toBe(newProcessedName);
      expect(
        target.every(({ sourceZipFileId, isOutdated }) => !sourceZipFileId && !isOutdated),
      ).toBeTrue();
      expect(state.fileTopics.filter(({ projectVersion }) => projectVersion === 2)).toEqual([
        expect.objectContaining({ id: topicId, fileId: unchangedId }),
      ]);
    } finally {
      await cleanupScenario(database, storage, [projectId], []);
    }
  });

  test("accepts the incumbent old-unchanged plus new-entry projection for renamed-to-new", async () => {
    const projectId = crypto.randomUUID();
    const zipId = crypto.randomUUID();
    const fileId = crypto.randomUUID();
    try {
      await database.db.insert(zipFiles).values({
        id: zipId,
        ...nodeValues(projectId, 1),
        filename: "renamed-choice.zip",
        bucketPath: `zips/${projectId}/v1/renamed-choice.zip`,
        type: "ZIP",
        workflowStatus: "REQUIRES_APPROVAL",
        approvalStatus: "REQUIRES_APPROVAL",
        approvalError: null,
        sourceProjectVersion: 1,
      });
      await database.db.insert(zipFileDiffEntries).values({
        id: crypto.randomUUID(),
        zipFileId: zipId,
        projectVersion: 1,
        entryKey: fileId,
        computedKind: "renamed",
        decisionKind: "renamed",
        fileId,
        filename: "new.pdf",
        oldName: "old.pdf",
        newName: "new.pdf",
        bucketPath: `zip_entries/${projectId}/new.pdf`,
        sourceSha: null,
        targetSha: null,
        sha: "rename-sha",
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      const submitted = {
        new: [
          {
            filename: "new.pdf",
            bucketPath: `zip_entries/${projectId}/new.pdf`,
            sha: "rename-sha",
          },
        ],
        deleted: [],
        changed: [],
        renamed: [],
        unchanged: [{ fileId: fileId, filename: "old.pdf", sha: "rename-sha" }],
      };
      const response = await mutateJson(
        `/v2/files/${zipId}/diff`,
        mutationRequest("POST", submitted),
      );
      expect(response.status).toBe(200);
      expect(parseMutationContract(FileDiffSchema, response.body)).toEqual(submitted);
      const state = await readMutationProjectState(database, projectId);
      expect(state.zipFileDiffEntries).toEqual([
        expect.objectContaining({ entryKey: fileId, decisionKind: "new", filename: "new.pdf" }),
      ]);

      const conflicting = {
        ...submitted,
        new: [submitted.new[0]!, submitted.new[0]!],
        unchanged: [],
      };
      const conflictResponse = await mutateJson(
        `/v2/files/${zipId}/diff`,
        mutationRequest("POST", conflicting),
      );
      expect(conflictResponse.status).toBe(422);
      expect((await readMutationProjectState(database, projectId)).zipFileDiffEntries).toEqual([
        expect.objectContaining({ entryKey: fileId, decisionKind: "new", filename: "new.pdf" }),
      ]);
    } finally {
      await cleanupScenario(database, storage, [projectId], []);
    }
  });

  test("applies and idempotently replays in-place delete, rename, change, and new decisions", async () => {
    const projectId = crypto.randomUUID();
    const zipId = crypto.randomUUID();
    const deletedId = crypto.randomUUID();
    const changedId = crypto.randomUUID();
    const renamedId = crypto.randomUUID();
    const processedId = crypto.randomUUID();
    const changedInput = `zip_entries/${projectId}/changed.pdf`;
    const newInput = `zip_entries/${projectId}/new.pdf`;
    const changedTarget = `documents/${projectId}/v2/changed.pdf`;
    const newTarget = `documents/${projectId}/v1/new.pdf`;
    const objectPaths = [changedInput, newInput, changedTarget, newTarget];
    const objects = objectPaths.map((path) => ({ bucket: "clean" as const, path }));

    try {
      await seedMutationProjects(database, [{ id: projectId, projectVersion: 1 }]);
      await setMutationProjectLock(database, {
        projectId,
        sourceVersion: 1,
        targetVersion: 1,
        lockToken: "in-place-lock",
      });
      await putMutationObject(storage, "clean", changedInput, "replacement", "application/pdf");
      await putMutationObject(storage, "clean", newInput, "new document", "application/pdf");
      await database.db.insert(zipFiles).values({
        id: zipId,
        ...nodeValues(projectId, 1),
        filename: "in-place.zip",
        bucketPath: `zips/${projectId}/v1/in-place.zip`,
        type: "ZIP",
        workflowStatus: "COMPLETED",
        approvalStatus: "APPROVED",
        approvalError: null,
        sourceProjectVersion: 1,
      });
      await database.db.insert(files).values([
        fileRow(projectId, 1, {
          id: deletedId,
          type: "DOCUMENT",
          filename: "deleted.pdf",
          bucketPath: `documents/${projectId}/v1/deleted.pdf`,
        }),
        fileRow(projectId, 1, {
          id: changedId,
          type: "DOCUMENT",
          filename: "changed.pdf",
          bucketPath: `documents/${projectId}/v1/changed.pdf`,
        }),
        fileRow(projectId, 1, {
          id: renamedId,
          type: "DOCUMENT",
          filename: "old.pdf",
          bucketPath: `documents/${projectId}/v1/old.pdf`,
        }),
        fileRow(projectId, 1, {
          id: processedId,
          type: "CONTENT_EXTRACTION",
          filename: "old/old_processed.json",
          bucketPath: `content_extraction/${projectId}/v1/old/old_processed.json`,
        }),
      ]);
      const base = {
        zipFileId: zipId,
        projectVersion: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      await database.db.insert(zipFileDiffEntries).values([
        {
          ...base,
          id: crypto.randomUUID(),
          entryKey: deletedId,
          computedKind: "deleted",
          decisionKind: "deleted",
          fileId: deletedId,
          filename: "deleted.pdf",
          oldName: null,
          newName: null,
          bucketPath: null,
          sourceSha: null,
          targetSha: null,
          sha: "deleted-sha",
        },
        {
          ...base,
          id: crypto.randomUUID(),
          entryKey: changedId,
          computedKind: "changed",
          decisionKind: "changed",
          fileId: changedId,
          filename: "changed.pdf",
          oldName: null,
          newName: null,
          bucketPath: changedInput,
          sourceSha: "old-sha",
          targetSha: "new-sha",
          sha: null,
        },
        {
          ...base,
          id: crypto.randomUUID(),
          entryKey: renamedId,
          computedKind: "renamed",
          decisionKind: "renamed",
          fileId: renamedId,
          filename: "renamed.pdf",
          oldName: "old.pdf",
          newName: "renamed.pdf",
          bucketPath: null,
          sourceSha: null,
          targetSha: null,
          sha: "renamed-sha",
        },
        {
          ...base,
          id: crypto.randomUUID(),
          entryKey: "new.pdf",
          computedKind: "new",
          decisionKind: "new",
          fileId: null,
          filename: "new.pdf",
          oldName: null,
          newName: null,
          bucketPath: newInput,
          sourceSha: null,
          targetSha: null,
          sha: "new-sha",
        },
      ]);

      const body = {
        sourceVersion: 1,
        targetVersion: 1,
        lockToken: "in-place-lock",
        dryRun: false,
      };
      for (const _run of [1, 2]) {
        const response = await mutateJson(
          `/v2/internal/files/${projectId}/zips/${zipId}/commit-diff`,
          mutationRequest("POST", body),
        );
        expect(response.status).toBe(200);
        expect(parseMutationContract(CommitDiffResponseSchema, response.body)).toEqual({
          dryRun: false,
          new: 1,
          changed: 1,
          renamed: 1,
          unchanged: 0,
        });
      }

      const state = await readMutationProjectState(database, projectId);
      expect(state.files.find(({ id }) => id === deletedId)?.isDeleted).toBeTrue();
      expect(state.files.find(({ id }) => id === changedId)).toMatchObject({
        version: 2,
        bucketPath: changedTarget,
        sourceZipFileId: zipId,
        isDeleted: false,
      });
      expect(state.files.find(({ id }) => id === renamedId)?.filename).toBe("renamed.pdf");
      expect(state.files.find(({ id }) => id === processedId)?.filename).toBe(
        "renamed/renamed_processed.json",
      );
      expect(state.files.filter(({ filename }) => filename === "new.pdf")).toEqual([
        expect.objectContaining({
          version: 1,
          bucketPath: newTarget,
          sourceZipFileId: zipId,
          isDeleted: false,
        }),
      ]);
      expect(await readMutationObject(storage, "clean", changedTarget)).toEqual({
        bytes: new TextEncoder().encode("replacement"),
        contentType: "application/pdf",
      });
      expect(await readMutationObject(storage, "clean", newTarget)).toEqual({
        bytes: new TextEncoder().encode("new document"),
        contentType: "application/pdf",
      });
    } finally {
      await cleanupScenario(database, storage, [projectId], objects);
    }
  });
});
