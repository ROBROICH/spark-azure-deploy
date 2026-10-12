import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { HttpJson } from "@spark-workflow/http-host";

import mutationScenarios from "../../fixtures/mutation-scenarios.json";
import { fileTopics, files, zipFileDiffEntries, zipFiles } from "../../src/db/schema.ts";
import { dmsErrors } from "../../src/errors.ts";
import {
  ApprovalActionResponseSchema,
  CancelResponseSchema,
  CommitDiffResponseSchema,
  CopyVersionResponseSchema,
  DetailErrorSchema,
  FileDiffSchema,
  FileResponseSchema,
  StartFileProcessingResponseSchema,
  UndoVersionResponseSchema,
  ZipApprovalStatusResponseSchema,
  ZipFileResponseSchema,
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
  mutationObjectExists,
  putMutationObject,
  readMutationObject,
  type MutationStorage,
} from "../support/mutation-storage.ts";
const describeMutationTests = process.env.DMS_MUTATION_BASE_URL === undefined ? describe.skip : describe;

export const FROZEN_MUTATION_ROUTE_INVENTORY = [
  "POST /v2/files/confirm-upload",
  "PATCH /v2/files/${fileId}?projectVersion=",
  "DELETE /v2/files/${fileId}?projectVersion=",
  "POST /v2/files/start-file-processing",
  "POST /v2/internal/files/confirm-upload",
  "PATCH /v2/internal/files/${projectId}/zips/${zipId}/approval-status",
  "POST /v2/internal/files/${projectId}/zips/${zipId}/commit-diff",
  "POST /v2/files/${zipId}/decision",
  "POST /v2/files/${zipId}/diff",
  "POST /v2/files/${zipId}/cancel",
  "POST /${projectId}/copy-version",
  "POST /${projectId}/undo-version",
] as const;

const ACTOR_ID = "82000000-0000-4000-8000-000000000001";
const AUDIT_HEADERS = {
  "X-Actor-User-Id": ACTOR_ID,
  "X-Request-Id": "dms-mutation-test",
  "X-Request-Starttime": "2026-07-17T08:00:00.000Z",
};

const processingAuditHeaders = {
  "X-Actor-User-Id": "00000000-0000-4000-8000-000000000301",
  "X-Workflow-Type": "FileProcessingWorkflow",
};

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

async function cleanupScenario(
  database: MutationDatabase,
  storage: MutationStorage,
  projectIds: readonly string[],
  objects: ReadonlyArray<{ bucket: "clean" | "quarantine"; path: string }>,
): Promise<void> {
  const failures: Error[] = [];
  for (const cleanup of [
    () => cleanupMutationProjects(database, projectIds),
    () => cleanupMutationObjects(storage, objects),
    () => assertMutationProjectsAbsent(database, projectIds),
    () => assertMutationObjectsAbsent(storage, objects),
  ]) {
    try {
      await cleanup();
    } catch (error) {
      failures.push(error instanceof Error ? error : new Error(String(error)));
    }
  }
  if (failures.length > 0) {
    throw new AggregateError(failures, "DMS mutation scenario cleanup failed");
  }
}

describeMutationTests("Document Management HTTP mutation contract", () => {
  let database: MutationDatabase;
  let storage: MutationStorage;

  beforeAll(async () => {
    database = createMutationDatabase();
    storage = createMutationStorage();
  });

  afterAll(async () => {
    await database.client.close();
  });

  test("freezes public confirmation, duplicate/missing failures, metadata, topics, history, audit, and soft delete", async () => {
    const projectId = crypto.randomUUID();
    const zipProjectId = crypto.randomUUID();
    const missingProjectId = crypto.randomUUID();
    const wrongPlacementProjectId = crypto.randomUUID();
    const isolationProjectId = crypto.randomUUID();
    const isolationFileId = crypto.randomUUID();
    const topicId = crypto.randomUUID();
    const filename = `mutation-${projectId}.pdf`;
    const zipFilename = `mutation-${zipProjectId}.zip`;
    const missingFilename = `missing-${missingProjectId}.pdf`;
    const wrongPlacementFilename = `wrong-placement-${wrongPlacementProjectId}.pdf`;
    const isolationFilename = `isolation-${isolationProjectId}.pdf`;
    const objectPath = `documents/${projectId}/v1/${filename}`;
    const versionTwoPath = `documents/${projectId}/v2/${filename}`;
    const zipPath = `zips/${zipProjectId}/v1/${zipFilename}`;
    const missingPath = `documents/${missingProjectId}/v1/${missingFilename}`;
    const wrongPlacementPath = `documents/${wrongPlacementProjectId}/v1/${wrongPlacementFilename}`;
    const isolationVersionOnePath = `documents/${isolationProjectId}/v1/${isolationFilename}`;
    const isolationVersionTwoPath = `documents/${isolationProjectId}/v2/${isolationFilename}`;
    const ownedObjects = [
      { bucket: "quarantine" as const, path: objectPath },
      { bucket: "clean" as const, path: objectPath },
      { bucket: "quarantine" as const, path: versionTwoPath },
      { bucket: "clean" as const, path: versionTwoPath },
      { bucket: "quarantine" as const, path: zipPath },
      { bucket: "clean" as const, path: zipPath },
      { bucket: "quarantine" as const, path: missingPath },
      { bucket: "clean" as const, path: missingPath },
      { bucket: "quarantine" as const, path: wrongPlacementPath },
      { bucket: "clean" as const, path: wrongPlacementPath },
      { bucket: "quarantine" as const, path: isolationVersionOnePath },
      { bucket: "clean" as const, path: isolationVersionOnePath },
      { bucket: "quarantine" as const, path: isolationVersionTwoPath },
      { bucket: "clean" as const, path: isolationVersionTwoPath },
    ];

    try {
      await seedMutationProjects(database, [
        { id: projectId, projectVersion: 1 },
        { id: zipProjectId, projectVersion: 1 },
        { id: missingProjectId, projectVersion: 1 },
        { id: wrongPlacementProjectId, projectVersion: 1 },
        { id: isolationProjectId, projectVersion: 2 },
      ]);
      await putMutationObject(
        storage,
        "quarantine",
        objectPath,
        mutationScenarios.bytes.publicDocument,
        "application/pdf",
      );
      const confirmedResponse = await mutateJson(
          "/v2/files/confirm-upload?projectVersion=1",
          mutationRequest(
            "POST",
            {
              type: "document",
              projectId,
              filename,
              createNewVersion: false,
            },
            AUDIT_HEADERS,
          ),
        );
      expect(confirmedResponse.status).toBe(200);
      const confirmed = parseMutationContract(ZipFileResponseSchema, confirmedResponse.body);
      expect(confirmed).toMatchObject({
        type: "document",
        filename,
        bucketPath: objectPath,
        projectId,
        workflowStatus: "PENDING",
        approvalStatus: null,
        approvalError: null,
        sourceProjectVersion: null,
      });
      const fileId = confirmed.id;

      let state = await readMutationProjectState(database, projectId);
      expect(state.files).toHaveLength(1);
      expect(state.files[0]).toMatchObject({
        id: fileId,
        projectId,
        projectVersion: 1,
        filename,
        mimeType: "application/pdf",
        version: 1,
        isDeleted: false,
        workflowStatus: "PENDING",
      });
      expect(state.audit.map(({ entityType, changeType }) => ({ entityType, changeType }))).toEqual(
        [{ entityType: "file", changeType: "create" }],
      );
      expect(state.audit[0]?.actorUserId).toBe(ACTOR_ID);
      expect(await mutationObjectExists(storage, "clean", objectPath)).toBeFalse();
      expect(await readMutationObject(storage, "quarantine", objectPath)).toEqual({
        bytes: new TextEncoder().encode(mutationScenarios.bytes.publicDocument),
        contentType: "application/pdf",
      });

      await putMutationObject(
        storage,
        "quarantine",
        zipPath,
        mutationScenarios.bytes.publicZip,
        "application/zip",
      );
      const zipResponse = await mutateJson(
          "/v2/files/confirm-upload?projectVersion=1",
          mutationRequest("POST", {
            type: "zip",
            projectId: zipProjectId,
            filename: zipFilename,
            createNewVersion: false,
          }),
        );
      expect(zipResponse.status).toBe(200);
      const confirmedZip = parseMutationContract(ZipFileResponseSchema, zipResponse.body);
      expect(confirmedZip).toMatchObject({
        type: "zip",
        filename: zipFilename,
        bucketPath: zipPath,
        projectId: zipProjectId,
        workflowStatus: "PENDING",
        approvalStatus: null,
      });
      const zipState = await readMutationProjectState(database, zipProjectId);
      expect(zipState.zipFiles).toHaveLength(1);
      expect(zipState.zipFiles[0]).toMatchObject({
        id: confirmedZip.id,
        projectId: zipProjectId,
        projectVersion: 1,
        filename: zipFilename,
        type: "ZIP",
        workflowStatus: "PENDING",
      });
      expect(
        zipState.audit.map(({ entityType, changeType }) => ({ entityType, changeType })),
      ).toEqual([{ entityType: "zip_file", changeType: "create" }]);
      expect(await mutationObjectExists(storage, "clean", zipPath)).toBeFalse();
      expect(await readMutationObject(storage, "quarantine", zipPath)).toEqual({
        bytes: new TextEncoder().encode(mutationScenarios.bytes.publicZip),
        contentType: "application/zip",
      });
      const duplicate = await mutateJson(
          "/v2/files/confirm-upload?projectVersion=1",
          mutationRequest("POST", {
            type: "document",
            projectId,
            filename,
            createNewVersion: false,
          }),
        );
      expect(duplicate.status).toBe(409);
      const duplicateDetail = parseMutationContract(DetailErrorSchema, duplicate.body).detail;
      expect(duplicateDetail).toContain("already exists");
      expect(duplicateDetail).not.toContain(filename);

      const invalidVersion = await mutateJson(
          `/v2/files/${fileId}?projectVersion=0`,
          mutationRequest("PATCH", { vectorSearchable: true }),
        );
      expect(invalidVersion.status).toBe(422);
      const updatedResponse = await mutateJson(
          `/v2/files/${fileId}?projectVersion=1`,
          mutationRequest("PATCH", { vectorSearchable: true, topics: [topicId] }, AUDIT_HEADERS),
        );
      expect(updatedResponse.status).toBe(200);
      expect(parseMutationContract(FileResponseSchema, updatedResponse.body)).toMatchObject({
        id: fileId,
        filename,
        mimeType: "application/pdf",
        vectorSearchable: true,
        topics: [topicId],
      });
      const nullableResponse = await mutateJson(
          `/v2/files/${fileId}?projectVersion=1`,
          mutationRequest("PATCH", { vectorSearchable: null }, AUDIT_HEADERS),
        );
      expect(nullableResponse.status).toBe(200);
      expect(parseMutationContract(FileResponseSchema, nullableResponse.body)).toMatchObject({
        id: fileId,
        vectorSearchable: null,
        topics: [topicId],
      });

      await putMutationObject(
        storage,
        "quarantine",
        versionTwoPath,
        mutationScenarios.bytes.publicDocumentV2,
        "application/pdf",
      );
      const versionTwoResponse = await mutateJson(
          "/v2/files/confirm-upload?projectVersion=1",
          mutationRequest(
            "POST",
            {
              type: "document",
              projectId,
              filename,
              createNewVersion: true,
            },
            AUDIT_HEADERS,
          ),
        );
      expect(versionTwoResponse.status).toBe(200);
      const confirmedVersionTwo = parseMutationContract(
        ZipFileResponseSchema,
        versionTwoResponse.body,
      );
      expect(confirmedVersionTwo).toMatchObject({
        type: "document",
        filename,
        bucketPath: versionTwoPath,
        projectId,
        workflowStatus: "PENDING",
      });
      const activeFileId = confirmedVersionTwo.id;
      expect(activeFileId).not.toBe(fileId);

      state = await readMutationProjectState(database, projectId);
      expect(state.files).toHaveLength(2);
      expect(state.files.find(({ id }) => id === fileId)).toMatchObject({
        projectVersion: 1,
        version: 1,
        bucketPath: objectPath,
        mimeType: "application/pdf",
        isDeleted: true,
      });
      expect(state.files.find(({ id }) => id === activeFileId)).toMatchObject({
        projectVersion: 1,
        version: 2,
        bucketPath: versionTwoPath,
        mimeType: "application/pdf",
        isDeleted: false,
        workflowStatus: "PENDING",
      });
      expect(state.fileHistory).toHaveLength(5);
      const priorVersionHistory = state.fileHistory.filter(({ id }) => id === fileId);
      const activeVersionHistory = state.fileHistory.filter(({ id }) => id === activeFileId);
      expect(priorVersionHistory).toHaveLength(4);
      expect(
        priorVersionHistory.every(
          (row) => row.projectVersion === 1 && row.version === 1 && row.bucketPath === objectPath,
        ),
      ).toBeTrue();
      expect(priorVersionHistory.every(({ isDeleted }) => isDeleted === false)).toBeTrue();
      expect(activeVersionHistory).toHaveLength(1);
      expect(activeVersionHistory[0]).toMatchObject({
        projectVersion: 1,
        version: 2,
        bucketPath: versionTwoPath,
        isDeleted: false,
      });
      expect(state.audit.map(({ changeType }) => changeType)).toEqual([
        "create",
        "update",
        "update",
        "create",
      ]);
      expect(await readMutationObject(storage, "quarantine", objectPath)).toEqual({
        bytes: new TextEncoder().encode(mutationScenarios.bytes.publicDocument),
        contentType: "application/pdf",
      });
      expect(await readMutationObject(storage, "quarantine", versionTwoPath)).toEqual({
        bytes: new TextEncoder().encode(mutationScenarios.bytes.publicDocumentV2),
        contentType: "application/pdf",
      });

      const deletedResponse = await mutateJson(
          `/v2/files/${activeFileId}?projectVersion=1`,
          mutationRequest("DELETE", undefined, AUDIT_HEADERS),
        );
      expect(deletedResponse.status).toBe(200);
      expect(parseMutationContract(FileResponseSchema, deletedResponse.body)).toMatchObject({
        id: activeFileId,
        isDeleted: true,
      });

      const repeatedDelete = await mutateJson(
          `/v2/files/${activeFileId}?projectVersion=1`,
          mutationRequest("DELETE", undefined, AUDIT_HEADERS),
        );
      expect(repeatedDelete.status).toBe(404);
      expect(parseMutationContract(DetailErrorSchema, repeatedDelete.body).detail).toContain(
        "not found",
      );

      state = await readMutationProjectState(database, projectId);
      expect(state.files).toHaveLength(2);
      expect(state.files.every(({ isDeleted }) => isDeleted)).toBeTrue();
      expect(state.fileTopics).toHaveLength(1);
      expect(state.fileTopics[0]).toMatchObject({ fileId, topicId, projectId });
      expect(state.fileHistory).toHaveLength(6);
      expect(state.fileHistory.filter(({ id }) => id === fileId)).toHaveLength(4);
      const deletedVersionHistory = state.fileHistory.filter(({ id }) => id === activeFileId);
      expect(deletedVersionHistory).toHaveLength(2);
      expect(
        deletedVersionHistory.every(
          (row) =>
            row.version === 2 && row.bucketPath === versionTwoPath && row.isDeleted === false,
        ),
      ).toBeTrue();
      expect(state.audit.map(({ changeType }) => changeType)).toEqual([
        "create",
        "update",
        "update",
        "create",
        "delete",
      ]);
      expect(await mutationObjectExists(storage, "quarantine", objectPath)).toBeTrue();
      expect(await mutationObjectExists(storage, "quarantine", versionTwoPath)).toBeTrue();

      await putMutationObject(
        storage,
        "quarantine",
        isolationVersionOnePath,
        mutationScenarios.bytes.publicDocument,
        "application/pdf",
      );
      await putMutationObject(
        storage,
        "quarantine",
        isolationVersionTwoPath,
        mutationScenarios.bytes.publicDocumentV2,
        "application/pdf",
      );
      const insertedIsolationRows = await database.db
        .insert(files)
        .values([
          {
            id: isolationFileId,
            projectId: isolationProjectId,
            projectVersion: 1,
            createdAt: new Date("2026-07-17T08:00:00.000Z"),
            updatedAt: new Date("2026-07-17T08:00:00.000Z"),
            isDeleted: false,
            isOutdated: false,
            frontendParentIds: [],
            updateType: "AUTOMATED",
            type: "DOCUMENT",
            filename: isolationFilename,
            mimeType: "application/pdf",
            version: 1,
            bucketPath: isolationVersionOnePath,
            addedInVersion: 1,
            workflowId: null,
            runId: null,
            vectorSearchable: false,
            sourceZipFileId: null,
            workflowStatus: "COMPLETED",
          },
          {
            id: isolationFileId,
            ...nodeValues(isolationProjectId, 2),
            type: "DOCUMENT",
            filename: isolationFilename,
            mimeType: "application/pdf",
            version: 2,
            bucketPath: isolationVersionTwoPath,
            addedInVersion: 1,
            workflowId: null,
            runId: null,
            vectorSearchable: false,
            sourceZipFileId: null,
            workflowStatus: "COMPLETED",
          },
        ])
        .returning();
      const defaultedIsolationRow = insertedIsolationRows.find(
        ({ projectVersion }) => projectVersion === 1,
      );
      expect(defaultedIsolationRow?.sysPeriod).toMatch(/^\[.+,\)$/);
      const isolatedUpdate = await mutateJson(
          `/v2/files/${isolationFileId}?projectVersion=1`,
          mutationRequest("PATCH", { vectorSearchable: true }, AUDIT_HEADERS),
        );
      expect(isolatedUpdate.status).toBe(200);
      expect(parseMutationContract(FileResponseSchema, isolatedUpdate.body)).toMatchObject({
        id: isolationFileId,
        projectVersion: 1,
        vectorSearchable: true,
        isDeleted: false,
      });

      const isolatedDelete = await mutateJson(
          `/v2/files/${isolationFileId}?projectVersion=2`,
          mutationRequest("DELETE", undefined, AUDIT_HEADERS),
        );
      expect(isolatedDelete.status).toBe(200);
      expect(parseMutationContract(FileResponseSchema, isolatedDelete.body)).toMatchObject({
        id: isolationFileId,
        projectVersion: 2,
        vectorSearchable: false,
        isDeleted: true,
      });

      const isolationState = await readMutationProjectState(database, isolationProjectId);
      expect(isolationState.files).toHaveLength(2);
      expect(isolationState.files.find(({ projectVersion }) => projectVersion === 1)).toMatchObject(
        {
          id: isolationFileId,
          bucketPath: isolationVersionOnePath,
          vectorSearchable: true,
          isDeleted: false,
        },
      );
      expect(isolationState.files.find(({ projectVersion }) => projectVersion === 2)).toMatchObject(
        {
          id: isolationFileId,
          bucketPath: isolationVersionTwoPath,
          vectorSearchable: false,
          isDeleted: true,
        },
      );
      expect(isolationState.fileHistory).toHaveLength(2);
      expect(isolationState.fileHistory).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: isolationFileId,
            projectVersion: 1,
            bucketPath: isolationVersionOnePath,
            vectorSearchable: false,
            isDeleted: false,
          }),
          expect.objectContaining({
            id: isolationFileId,
            projectVersion: 2,
            bucketPath: isolationVersionTwoPath,
            vectorSearchable: false,
            isDeleted: false,
          }),
        ]),
      );
      expect(isolationState.audit.map(({ changeType }) => changeType)).toEqual([
        "update",
        "delete",
      ]);
      expect(await readMutationObject(storage, "quarantine", isolationVersionOnePath)).toEqual({
        bytes: new TextEncoder().encode(mutationScenarios.bytes.publicDocument),
        contentType: "application/pdf",
      });
      expect(await readMutationObject(storage, "quarantine", isolationVersionTwoPath)).toEqual({
        bytes: new TextEncoder().encode(mutationScenarios.bytes.publicDocumentV2),
        contentType: "application/pdf",
      });

      await putMutationObject(
        storage,
        "clean",
        wrongPlacementPath,
        mutationScenarios.bytes.publicDocument,
        "application/pdf",
      );
      const wrongPlacement = await mutateJson(
          "/v2/files/confirm-upload?projectVersion=1",
          mutationRequest("POST", {
            type: "document",
            projectId: wrongPlacementProjectId,
            filename: wrongPlacementFilename,
            createNewVersion: false,
          }),
        );
      expect(wrongPlacement.status).toBe(404);
      expect(parseMutationContract(DetailErrorSchema, wrongPlacement.body).detail).toContain(
        "Uploaded file not found",
      );
      expect(
        Object.values(await readMutationProjectState(database, wrongPlacementProjectId)).every(
          (rows) => rows.length === 0,
        ),
      ).toBeTrue();
      expect(await mutationObjectExists(storage, "quarantine", wrongPlacementPath)).toBeFalse();
      expect(await readMutationObject(storage, "clean", wrongPlacementPath)).toEqual({
        bytes: new TextEncoder().encode(mutationScenarios.bytes.publicDocument),
        contentType: "application/pdf",
      });
      const missing = await mutateJson(
          "/v2/files/confirm-upload?projectVersion=1",
          mutationRequest("POST", {
            type: "document",
            projectId: missingProjectId,
            filename: missingFilename,
            createNewVersion: false,
          }),
        );
      expect(missing.status).toBe(404);
      const missingDetail = parseMutationContract(DetailErrorSchema, missing.body).detail;
      expect(missingDetail).toContain("Uploaded file not found");
      expect(missingDetail).not.toContain(missingFilename);
      expect(
        Object.values(await readMutationProjectState(database, missingProjectId)).every(
          (rows) => rows.length === 0,
        ),
      ).toBeTrue();
    } finally {
      await cleanupScenario(
        database,
        storage,
        [projectId, zipProjectId, missingProjectId, wrongPlacementProjectId, isolationProjectId],
        ownedObjects,
      );
    }
  });

  test("freezes internal clean confirmation and rejects external authorization before effects", async () => {
    const projectId = crypto.randomUUID();
    const zipProjectId = crypto.randomUUID();
    const filename = `content-${projectId}.json`;
    const zipFilename = `internal-${zipProjectId}.zip`;
    const objectPath = `content_extraction/${projectId}/v1/${filename}`;
    const zipPath = `zips/${zipProjectId}/v1/${zipFilename}`;
    const ownedObjects = [
      { bucket: "clean" as const, path: objectPath },
      { bucket: "quarantine" as const, path: objectPath },
      { bucket: "clean" as const, path: zipPath },
      { bucket: "quarantine" as const, path: zipPath },
    ];

    try {
      await seedMutationProjects(database, [
        { id: projectId, projectVersion: 1 },
        { id: zipProjectId, projectVersion: 1 },
      ]);
      await putMutationObject(
        storage,
        "clean",
        objectPath,
        mutationScenarios.bytes.internalDocument,
        "application/json",
      );
      const payload = {
        type: "content_extraction",
        projectId,
        filename,
        createNewVersion: false,
      };

      const rejected = await mutateJson(
          "/v2/internal/files/confirm-upload?projectVersion=1",
          mutationRequest("POST", payload, { Authorization: "Bearer forbidden" }),
        );
      expect(rejected.status).toBe(403);
      expect(parseMutationContract(DetailErrorSchema, rejected.body).detail).toBe(
        "Internal endpoint",
      );
      expect(
        Object.values(await readMutationProjectState(database, projectId)).every(
          (rows) => rows.length === 0,
        ),
      ).toBeTrue();
      const confirmedResponse = await mutateJson(
          "/v2/internal/files/confirm-upload?projectVersion=1",
          mutationRequest("POST", payload, AUDIT_HEADERS),
        );
      expect(confirmedResponse.status).toBe(200);
      const confirmed = parseMutationContract(FileResponseSchema, confirmedResponse.body);
      expect(confirmed).toMatchObject({
        type: "content_extraction",
        filename,
        bucketPath: objectPath,
        projectId,
      });
      const state = await readMutationProjectState(database, projectId);
      expect(state.files).toHaveLength(1);
      expect(state.audit).toHaveLength(1);
      expect(await mutationObjectExists(storage, "quarantine", objectPath)).toBeFalse();
      expect(await readMutationObject(storage, "clean", objectPath)).toEqual({
        bytes: new TextEncoder().encode(mutationScenarios.bytes.internalDocument),
        contentType: "application/json;charset=utf-8",
      });

      await putMutationObject(
        storage,
        "quarantine",
        zipPath,
        mutationScenarios.bytes.publicZip,
        "application/zip",
      );
      const zipResponse = await mutateJson(
          "/v2/internal/files/confirm-upload?projectVersion=1",
          mutationRequest("POST", {
            type: "zip",
            projectId: zipProjectId,
            filename: zipFilename,
            createNewVersion: false,
          }),
        );
      expect(zipResponse.status).toBe(200);
      const confirmedZip = parseMutationContract(ZipFileResponseSchema, zipResponse.body);
      expect(confirmedZip).toMatchObject({
        type: "zip",
        filename: zipFilename,
        bucketPath: zipPath,
        projectId: zipProjectId,
        workflowStatus: "PENDING",
      });
      const zipState = await readMutationProjectState(database, zipProjectId);
      expect(zipState.zipFiles).toHaveLength(1);
      expect(
        zipState.audit.map(({ entityType, changeType }) => ({ entityType, changeType })),
      ).toEqual([{ entityType: "zip_file", changeType: "create" }]);
      expect(await mutationObjectExists(storage, "clean", zipPath)).toBeFalse();
      expect(await readMutationObject(storage, "quarantine", zipPath)).toEqual({
        bytes: new TextEncoder().encode(mutationScenarios.bytes.publicZip),
        contentType: "application/zip",
      });
    } finally {
      await cleanupScenario(database, storage, [projectId, zipProjectId], ownedObjects);
    }
  });

  test("freezes ZIP and single-file processing outcomes at the exact Temporal boundary", async () => {
    const success = mutationScenarios.temporal.zipSuccess;
    const already = mutationScenarios.temporal.zipAlreadyStarted;
    const single = mutationScenarios.temporal.singleAlreadyStarted;
    const missingProjectId = crypto.randomUUID();
    const missingZipId = crypto.randomUUID();
    const projectIds = [success.projectId, already.projectId, single.projectId, missingProjectId];


    try {
      await seedMutationProjects(database, [
        { id: success.projectId, projectVersion: success.projectVersion },
        { id: already.projectId, projectVersion: already.projectVersion },
        { id: single.projectId, projectVersion: single.projectVersion },
        { id: missingProjectId, projectVersion: 2 },
      ]);
      const zipSeedRows: Array<typeof zipFiles.$inferInsert> = [
        {
          id: success.fileId,
          ...nodeValues(success.projectId, success.projectVersion),
          filename: success.filename,
          bucketPath: success.bucketPath,
          type: "ZIP",
          workflowStatus: "PENDING",
          approvalStatus: null,
          approvalError: null,
          sourceProjectVersion: null,
        },
        {
          id: already.fileId,
          ...nodeValues(already.projectId, already.projectVersion),
          filename: already.filename,
          bucketPath: already.bucketPath,
          type: "ZIP",
          workflowStatus: "PENDING",
          approvalStatus: null,
          approvalError: null,
          sourceProjectVersion: null,
        },
        {
          id: missingZipId,
          ...nodeValues(missingProjectId, 2),
          filename: "missing-temporal-fixture.zip",
          bucketPath: `zips/${missingProjectId}/v1/missing-temporal-fixture.zip`,
          type: "ZIP",
          workflowStatus: "PENDING",
          approvalStatus: null,
          approvalError: null,
          sourceProjectVersion: null,
        },
      ];
      await database.db.insert(zipFiles).values(zipSeedRows);
      await database.db.insert(files).values({
        id: single.fileId,
        ...nodeValues(single.projectId, single.projectVersion),
        type: "DOCUMENT",
        filename: single.filename,
        mimeType: "application/pdf",
        version: 1,
        bucketPath: single.bucketPath,
        addedInVersion: single.projectVersion,
        workflowId: null,
        runId: null,
        vectorSearchable: null,
        sourceZipFileId: null,
        workflowStatus: "PENDING",
      });
      const startedResponse = await mutateJson(
          "/v2/files/start-file-processing",
          mutationRequest(
            "POST",
            { fileId: success.fileId, projectId: success.projectId },
            processingAuditHeaders,
          ),
        );
      expect(startedResponse.status).toBe(200);
      expect(
        parseMutationContract(StartFileProcessingResponseSchema, startedResponse.body),
      ).toEqual({
        workflowId: `FileProcessingWorkflow-${success.projectId}`,
        runId: "00000000-0000-4000-8000-000000000401",
        workflowStatus: "RUNNING",
      });
      let state = await readMutationProjectState(database, success.projectId);
      expect(state.zipFiles[0]?.workflowStatus).toBe("RUNNING");
      expect(state.zipFileHistory.map(({ workflowStatus }) => workflowStatus)).toContain("PENDING");
      expect(state.audit).toHaveLength(1);
      expect(state.audit[0]).toMatchObject({
        entityId: success.fileId,
        entityType: "zip_file",
        changeType: "action",
        actionType: "start_file_processing",
      });
      const alreadyResponse = await mutateJson(
          "/v2/files/start-file-processing",
          mutationRequest("POST", {
            fileId: already.fileId,
            projectId: already.projectId,
          }),
        );
      expect(alreadyResponse.status).toBe(409);
      expect(parseMutationContract(DetailErrorSchema, alreadyResponse.body).detail).toContain(
        "already running",
      );
      state = await readMutationProjectState(database, already.projectId);
      expect(state.zipFiles[0]?.workflowStatus).toBe("PENDING");
      expect(state.zipFileHistory.map(({ workflowStatus }) => workflowStatus)).toEqual([
        "PENDING",
        "RUNNING",
      ]);
      expect(state.audit).toHaveLength(1);
      const singleResponse = await mutateJson(
          "/v2/files/start-file-processing",
          mutationRequest("POST", { fileId: single.fileId, projectId: single.projectId }),
        );
      expect(singleResponse.status).toBe(500);
      expect(parseMutationContract(DetailErrorSchema, singleResponse.body).detail).toBe(
        dmsErrors.TEMPORAL_FAILED.message,
      );
      state = await readMutationProjectState(database, single.projectId);
      expect(state.files[0]?.workflowStatus).toBe("PENDING");
      expect(state.fileHistory.map(({ workflowStatus }) => workflowStatus)).toEqual([
        "PENDING",
        "RUNNING",
      ]);
      expect(state.audit).toHaveLength(2);
      const missingResponse = await mutateJson(
          "/v2/files/start-file-processing",
          mutationRequest("POST", { fileId: missingZipId, projectId: missingProjectId }),
        );
      expect(missingResponse.status).toBe(500);
      expect(parseMutationContract(DetailErrorSchema, missingResponse.body).detail).toBe(
        dmsErrors.TEMPORAL_FAILED.message,
      );
      state = await readMutationProjectState(database, missingProjectId);
      expect(state.zipFiles[0]?.workflowStatus).toBe("PENDING");
      expect(state.audit).toHaveLength(1);
    } finally {
      await cleanupScenario(database, storage, projectIds, []);
    }
  });

  test("freezes approval status, persisted diff decisions, approval outcomes, and cancellation", async () => {
    const approvalSuccess = mutationScenarios.temporal.approvalSuccess;
    const approvalNull = mutationScenarios.temporal.approvalNull;
    const approvalFailure = mutationScenarios.temporal.approvalFailure;
    const cancelSuccess = mutationScenarios.temporal.cancelSuccess;
    const cancelFailure = mutationScenarios.temporal.cancelFailure;
    const diffProjectId = crypto.randomUUID();
    const diffZipId = crypto.randomUUID();
    const diffFileId = crypto.randomUUID();
    const rejectProjectId = crypto.randomUUID();
    const rejectZipId = crypto.randomUUID();
    const approvedProjectId = crypto.randomUUID();
    const approvedZipId = crypto.randomUUID();
    const projectIds = [
      approvalSuccess.projectId,
      approvalNull.projectId,
      approvalFailure.projectId,
      cancelSuccess.projectId,
      cancelFailure.projectId,
      diffProjectId,
      rejectProjectId,
      approvedProjectId,
    ];


    try {
      await seedMutationProjects(database, [
        { id: approvalSuccess.projectId, projectVersion: approvalSuccess.projectVersion },
        { id: approvalNull.projectId, projectVersion: approvalNull.projectVersion },
        { id: approvalFailure.projectId, projectVersion: approvalFailure.projectVersion },
        { id: cancelSuccess.projectId, projectVersion: cancelSuccess.projectVersion },
        { id: cancelFailure.projectId, projectVersion: cancelFailure.projectVersion },
        { id: diffProjectId, projectVersion: 1 },
        { id: rejectProjectId, projectVersion: 1 },
        { id: approvedProjectId, projectVersion: 1 },
      ]);
      const rows: Array<typeof zipFiles.$inferInsert> = [
        {
          id: approvalSuccess.fileId,
          ...nodeValues(approvalSuccess.projectId, approvalSuccess.projectVersion),
          filename: "approval-success.zip",
          bucketPath: "fixtures/projects/103/approval-success.zip",
          type: "ZIP",
          workflowStatus: "REQUIRES_APPROVAL",
          approvalStatus: "REQUIRES_APPROVAL",
          approvalError: null,
          sourceProjectVersion: approvalSuccess.projectVersion,
        },
        {
          id: approvalNull.fileId,
          ...nodeValues(approvalNull.projectId, approvalNull.projectVersion),
          filename: "approval-null.zip",
          bucketPath: "fixtures/projects/104/approval-null.zip",
          type: "ZIP",
          workflowStatus: "REQUIRES_APPROVAL",
          approvalStatus: "REQUIRES_APPROVAL",
          approvalError: null,
          sourceProjectVersion: null,
        },
        {
          id: approvalFailure.fileId,
          ...nodeValues(approvalFailure.projectId, approvalFailure.projectVersion),
          filename: "approval-failure.zip",
          bucketPath: "fixtures/projects/106/approval-failure.zip",
          type: "ZIP",
          workflowStatus: "REQUIRES_APPROVAL",
          approvalStatus: "REQUIRES_APPROVAL",
          approvalError: null,
          sourceProjectVersion: approvalFailure.projectVersion,
        },
        {
          id: cancelSuccess.fileId,
          ...nodeValues(cancelSuccess.projectId, cancelSuccess.projectVersion),
          filename: "cancel-success.zip",
          bucketPath: "fixtures/projects/105/cancel-success.zip",
          type: "ZIP",
          workflowStatus: "RUNNING",
          approvalStatus: null,
          approvalError: null,
          sourceProjectVersion: null,
        },
        {
          id: cancelFailure.fileId,
          ...nodeValues(cancelFailure.projectId, cancelFailure.projectVersion),
          filename: "cancel-failure.zip",
          bucketPath: "fixtures/projects/107/cancel-failure.zip",
          type: "ZIP",
          workflowStatus: "RUNNING",
          approvalStatus: null,
          approvalError: null,
          sourceProjectVersion: null,
        },
        {
          id: diffZipId,
          ...nodeValues(diffProjectId, 1),
          filename: "decisions.zip",
          bucketPath: `zips/${diffProjectId}/v1/decisions.zip`,
          type: "ZIP",
          workflowStatus: "REQUIRES_APPROVAL",
          approvalStatus: "REQUIRES_APPROVAL",
          approvalError: null,
          sourceProjectVersion: 1,
        },
        {
          id: rejectZipId,
          ...nodeValues(rejectProjectId, 1),
          filename: "reject.zip",
          bucketPath: `zips/${rejectProjectId}/v1/reject.zip`,
          type: "ZIP",
          workflowStatus: "REQUIRES_APPROVAL",
          approvalStatus: "REQUIRES_APPROVAL",
          approvalError: null,
          sourceProjectVersion: 1,
        },
        {
          id: approvedZipId,
          ...nodeValues(approvedProjectId, 1),
          filename: "approved.zip",
          bucketPath: `zips/${approvedProjectId}/v1/approved.zip`,
          type: "ZIP",
          workflowStatus: "COMPLETED",
          approvalStatus: "APPROVED",
          approvalError: null,
          sourceProjectVersion: 1,
        },
      ];
      await database.db.insert(zipFiles).values(rows);
      await database.db.insert(zipFileDiffEntries).values({
        id: crypto.randomUUID(),
        zipFileId: diffZipId,
        projectVersion: 1,
        entryKey: diffFileId,
        computedKind: "changed",
        decisionKind: "changed",
        fileId: diffFileId,
        filename: "changed.pdf",
        oldName: null,
        newName: null,
        bucketPath: `documents/${diffProjectId}/v2/changed.pdf`,
        sourceSha: "source-sha",
        targetSha: "target-sha",
        sha: null,
        createdAt: new Date("2026-07-17T08:00:00.000Z"),
        updatedAt: new Date("2026-07-17T08:00:00.000Z"),
      });

      const statusResponse = await mutateJson(
        `/v2/internal/files/${diffProjectId}/zips/${diffZipId}/approval-status`,
        mutationRequest("PATCH", {
          approvalStatus: "APPROVING",
          error: "awaiting reviewer",
        }),
      );
      expect(statusResponse.status).toBe(200);
      expect(parseMutationContract(ZipApprovalStatusResponseSchema, statusResponse.body)).toEqual({
        approvalStatus: "APPROVING",
        error: "awaiting reviewer",
      });
      let state = await readMutationProjectState(database, diffProjectId);
      expect(state.zipFiles[0]).toMatchObject({
        approvalStatus: "APPROVING",
        approvalError: "awaiting reviewer",
      });
      expect(state.zipFileHistory).toHaveLength(1);
      expect(state.zipFileHistory[0]).toMatchObject({
        id: diffZipId,
        projectId: diffProjectId,
        projectVersion: 1,
        approvalStatus: "REQUIRES_APPROVAL",
        approvalError: null,
      });
      expect(state.audit).toHaveLength(0);

      const wrongProjectResponse = await mutateJson(
        `/v2/internal/files/${crypto.randomUUID()}/zips/${diffZipId}/approval-status`,
        mutationRequest("PATCH", {
          approvalStatus: "APPROVED",
          error: null,
        }),
      );
      expect(wrongProjectResponse.status).toBe(404);
      expect(parseMutationContract(DetailErrorSchema, wrongProjectResponse.body).detail).toBe(
        "ZIP file not found",
      );
      state = await readMutationProjectState(database, diffProjectId);
      expect(state.zipFiles[0]).toMatchObject({
        approvalStatus: "APPROVING",
        approvalError: "awaiting reviewer",
      });
      expect(state.zipFileHistory).toHaveLength(1);
      expect(state.zipFileHistory[0]?.approvalStatus).toBe("REQUIRES_APPROVAL");
      expect(state.audit).toHaveLength(0);

      const requiredStatusResponse = await mutateJson(
        `/v2/internal/files/${diffProjectId}/zips/${diffZipId}/approval-status`,
        mutationRequest("PATCH", {
          approvalStatus: "REQUIRES_APPROVAL",
          error: null,
        }),
      );
      expect(requiredStatusResponse.status).toBe(200);
      expect(
        parseMutationContract(ZipApprovalStatusResponseSchema, requiredStatusResponse.body),
      ).toEqual({
        approvalStatus: "REQUIRES_APPROVAL",
        error: null,
      });
      state = await readMutationProjectState(database, diffProjectId);
      expect(state.zipFiles[0]).toMatchObject({
        approvalStatus: "REQUIRES_APPROVAL",
        approvalError: null,
      });
      expect(state.zipFileHistory).toHaveLength(2);
      expect(state.zipFileHistory).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: diffZipId,
            approvalStatus: "REQUIRES_APPROVAL",
            approvalError: null,
          }),
          expect.objectContaining({
            id: diffZipId,
            approvalStatus: "APPROVING",
            approvalError: "awaiting reviewer",
          }),
        ]),
      );
      expect(state.audit).toHaveLength(0);

      const acceptedDiff = {
        new: [],
        deleted: [],
        changed: [],
        renamed: [],
        unchanged: [{ fileId: diffFileId, filename: "changed.pdf", sha: "target-sha" }],
      };
      const diffResponse = await mutateJson(
        `/v2/files/${diffZipId}/diff`,
        mutationRequest("POST", acceptedDiff, AUDIT_HEADERS),
      );
      expect(diffResponse.status).toBe(200);
      expect(parseMutationContract(FileDiffSchema, diffResponse.body)).toEqual(acceptedDiff);
      state = await readMutationProjectState(database, diffProjectId);
      expect(state.zipFileDiffEntries[0]?.decisionKind).toBe("unchanged");
      expect(state.audit).toHaveLength(1);
      expect(state.audit[0]).toMatchObject({
        entityId: diffZipId,
        entityType: "zip_file",
        changeType: "action",
        actionType: "set_file_diff",
      });

      const tamperedDiff = {
        new: [],
        deleted: [],
        changed: [
          {
            fileId: diffFileId,
            bucketPath: `documents/${diffProjectId}/v2/changed.pdf`,
            filename: "changed.pdf",
            sourceSha: "tampered",
            targetSha: "target-sha",
          },
        ],
        renamed: [],
        unchanged: [],
      };
      const tamperedResponse = await mutateJson(
        `/v2/files/${diffZipId}/diff`,
        mutationRequest("POST", tamperedDiff, AUDIT_HEADERS),
      );
      expect(tamperedResponse.status).toBe(422);
      expect(parseMutationContract(DetailErrorSchema, tamperedResponse.body).detail).toContain(
        "source_sha cannot be changed",
      );
      state = await readMutationProjectState(database, diffProjectId);
      expect(state.zipFileDiffEntries[0]?.decisionKind).toBe("unchanged");
      expect(state.audit).toHaveLength(1);

      const rejectedResponse = await mutateJson(
        `/v2/files/${rejectZipId}/decision?decision=reject`,
        mutationRequest("POST", undefined, AUDIT_HEADERS),
      );
      expect(rejectedResponse.status).toBe(200);
      expect(
        parseMutationContract(ApprovalActionResponseSchema, rejectedResponse.body),
      ).toMatchObject({
        status: "success",
        currentApprovalStatus: "REJECTED",
        zipApprovalStatus: "REJECTED",
      });
      state = await readMutationProjectState(database, rejectProjectId);
      expect(state.zipFiles[0]?.approvalStatus).toBe("REJECTED");
      expect(state.audit).toHaveLength(1);

      const alreadyApprovedResponse = await mutateJson(
        `/v2/files/${approvedZipId}/decision?decision=approve`,
        mutationRequest("POST"),
      );
      expect(alreadyApprovedResponse.status).toBe(200);
      expect(
        parseMutationContract(ApprovalActionResponseSchema, alreadyApprovedResponse.body),
      ).toMatchObject({
        status: "already_processed",
        currentApprovalStatus: "APPROVED",
        zipApprovalStatus: "APPROVED",
      });
      expect((await readMutationProjectState(database, approvedProjectId)).audit).toHaveLength(0);

      const approvedResponse = await mutateJson(
        `/v2/files/${approvalSuccess.fileId}/decision?decision=approve`,
        mutationRequest("POST", undefined, AUDIT_HEADERS),
      );
      expect(approvedResponse.status).toBe(200);
      expect(
        parseMutationContract(ApprovalActionResponseSchema, approvedResponse.body),
      ).toMatchObject({
        status: "success",
        currentApprovalStatus: "APPROVED",
        zipApprovalStatus: "REQUIRES_APPROVAL",
        newVersion: 10,
      });
      expect(
        (await readMutationProjectState(database, approvalSuccess.projectId)).audit,
      ).toHaveLength(1);

      const nullResponse = await mutateJson(
        `/v2/files/${approvalNull.fileId}/decision?decision=approve`,
        mutationRequest("POST"),
      );
      expect(nullResponse.status).toBe(200);
      expect(parseMutationContract(ApprovalActionResponseSchema, nullResponse.body)).toMatchObject({
        status: "failed",
        currentApprovalStatus: "REJECTED",
        zipApprovalStatus: "REQUIRES_APPROVAL",
      });
      expect((await readMutationProjectState(database, approvalNull.projectId)).audit).toHaveLength(
        0,
      );

      const failedResponse = await mutateJson(
        `/v2/files/${approvalFailure.fileId}/decision?decision=approve`,
        mutationRequest("POST"),
      );
      expect(failedResponse.status).toBe(200);
      expect(
        parseMutationContract(ApprovalActionResponseSchema, failedResponse.body),
      ).toMatchObject({
        status: "failed",
        message: `ZIP approval failed for file ${approvalFailure.fileId}`,
        currentApprovalStatus: "REJECTED",
        zipApprovalStatus: "REQUIRES_APPROVAL",
      });
      expect(
        (await readMutationProjectState(database, approvalFailure.projectId)).audit,
      ).toHaveLength(0);

      const cancelledResponse = await mutateJson(
        `/v2/files/${cancelSuccess.fileId}/cancel`,
        mutationRequest("POST", undefined, AUDIT_HEADERS),
      );
      expect(cancelledResponse.status).toBe(200);
      expect(parseMutationContract(CancelResponseSchema, cancelledResponse.body)).toEqual({
        fileId: cancelSuccess.fileId,
        success: true,
      });
      expect(
        (await readMutationProjectState(database, cancelSuccess.projectId)).audit,
      ).toHaveLength(1);

      const cancelFailureResponse = await mutateJson(
        `/v2/files/${cancelFailure.fileId}/cancel`,
        mutationRequest("POST"),
      );
      expect(cancelFailureResponse.status).toBe(500);
      expect(parseMutationContract(DetailErrorSchema, cancelFailureResponse.body).detail).toBe(
        dmsErrors.TEMPORAL_FAILED.message,
      );
      expect(
        (await readMutationProjectState(database, cancelFailure.projectId)).audit,
      ).toHaveLength(0);
    } finally {
      await cleanupScenario(database, storage, projectIds, []);
    }
  });

  test("freezes diff commit plus node copy and undo with lock, idempotency, rollback, and child ordering", async () => {
    const commitProjectId = crypto.randomUUID();
    const commitZipId = crypto.randomUUID();
    const commitFileId = crypto.randomUUID();
    const changedFileId = crypto.randomUUID();
    const renamedFileId = crypto.randomUUID();
    const deletedFileId = crypto.randomUUID();
    const commitPath = `documents/${commitProjectId}/v1/unchanged.pdf`;
    const changedSourcePath = `documents/${commitProjectId}/v1/changed.pdf`;
    const changedInputPath = `zip_entries/${commitProjectId}/changed.pdf`;
    const changedTargetPath = `documents/${commitProjectId}/v2/changed.pdf`;
    const renamedSourcePath = `documents/${commitProjectId}/v1/old-name.pdf`;
    const deletedSourcePath = `documents/${commitProjectId}/v1/deleted.pdf`;
    const newInputPath = `zip_entries/${commitProjectId}/new.pdf`;
    const newTargetPath = `documents/${commitProjectId}/v1/new.pdf`;
    const nodeProjectId = crypto.randomUUID();
    const nodeFileId = crypto.randomUUID();
    const nodeTopicId = crypto.randomUUID();
    const nodePath = `documents/${nodeProjectId}/v1/node.pdf`;
    const projectIds = [commitProjectId, nodeProjectId];
    const objectPaths = [
      commitPath,
      changedSourcePath,
      changedInputPath,
      changedTargetPath,
      renamedSourcePath,
      deletedSourcePath,
      newInputPath,
      newTargetPath,
    ];
    const objects = objectPaths.flatMap((path) => [
      { bucket: "clean" as const, path },
      { bucket: "quarantine" as const, path },
    ]);
    const readCommitObjectState = async () =>
      Promise.all(
        objects.map(async ({ bucket, path }) => ({
          bucket,
          path,
          object: (await mutationObjectExists(storage, bucket, path))
            ? await readMutationObject(storage, bucket, path)
            : null,
        })),
      );


    try {
      await seedMutationProjects(database, [
        { id: commitProjectId, projectVersion: 1 },
        { id: nodeProjectId, projectVersion: 1 },
      ]);
      await putMutationObject(
        storage,
        "clean",
        commitPath,
        mutationScenarios.bytes.diffSource,
        "application/pdf",
      );
      for (const path of [changedSourcePath, renamedSourcePath, deletedSourcePath]) {
        await putMutationObject(
          storage,
          "clean",
          path,
          mutationScenarios.bytes.diffSource,
          "application/pdf",
        );
      }
      await putMutationObject(
        storage,
        "clean",
        changedInputPath,
        mutationScenarios.bytes.diffReplacement,
        "application/pdf",
      );
      await putMutationObject(
        storage,
        "clean",
        newInputPath,
        mutationScenarios.bytes.diffNew,
        "application/pdf",
      );
      await database.db.insert(zipFiles).values({
        id: commitZipId,
        ...nodeValues(commitProjectId, 1),
        filename: "commit.zip",
        bucketPath: `zips/${commitProjectId}/v1/commit.zip`,
        type: "ZIP",
        workflowStatus: "COMPLETED",
        approvalStatus: "APPROVED",
        approvalError: null,
        sourceProjectVersion: 1,
      });
      await database.db.insert(files).values([
        {
          id: commitFileId,
          ...nodeValues(commitProjectId, 1),
          type: "DOCUMENT",
          filename: "unchanged.pdf",
          mimeType: "application/pdf",
          version: 1,
          bucketPath: commitPath,
          addedInVersion: 1,
          workflowId: null,
          runId: null,
          vectorSearchable: false,
          sourceZipFileId: null,
          workflowStatus: "COMPLETED",
        },
        {
          id: changedFileId,
          ...nodeValues(commitProjectId, 1),
          type: "DOCUMENT",
          filename: "changed.pdf",
          mimeType: "application/pdf",
          version: 1,
          bucketPath: changedSourcePath,
          addedInVersion: 1,
          workflowId: null,
          runId: null,
          vectorSearchable: false,
          sourceZipFileId: null,
          workflowStatus: "COMPLETED",
        },
        {
          id: renamedFileId,
          ...nodeValues(commitProjectId, 1),
          type: "DOCUMENT",
          filename: "old-name.pdf",
          mimeType: "application/pdf",
          version: 1,
          bucketPath: renamedSourcePath,
          addedInVersion: 1,
          workflowId: null,
          runId: null,
          vectorSearchable: false,
          sourceZipFileId: null,
          workflowStatus: "COMPLETED",
        },
        {
          id: deletedFileId,
          ...nodeValues(commitProjectId, 1),
          type: "DOCUMENT",
          filename: "deleted.pdf",
          mimeType: "application/pdf",
          version: 1,
          bucketPath: deletedSourcePath,
          addedInVersion: 1,
          workflowId: null,
          runId: null,
          vectorSearchable: false,
          sourceZipFileId: null,
          workflowStatus: "COMPLETED",
        },
        {
          id: nodeFileId,
          ...nodeValues(nodeProjectId, 1),
          type: "DOCUMENT",
          filename: "node.pdf",
          mimeType: "application/pdf",
          version: 1,
          bucketPath: nodePath,
          addedInVersion: 1,
          workflowId: null,
          runId: null,
          vectorSearchable: false,
          sourceZipFileId: null,
          workflowStatus: "COMPLETED",
        },
      ]);
      await database.db.insert(fileTopics).values({
        id: nodeTopicId,
        ...nodeValues(nodeProjectId, 1),
        fileId: nodeFileId,
        topicId: crypto.randomUUID(),
        subtopicId: null,
      });
      await database.db.insert(zipFileDiffEntries).values([
        {
          id: crypto.randomUUID(),
          zipFileId: commitZipId,
          projectVersion: 1,
          entryKey: commitFileId,
          computedKind: "unchanged",
          decisionKind: "unchanged",
          fileId: commitFileId,
          filename: "unchanged.pdf",
          oldName: null,
          newName: null,
          bucketPath: null,
          sourceSha: null,
          targetSha: null,
          sha: "unchanged-sha",
          createdAt: new Date("2026-07-17T08:00:00.000Z"),
          updatedAt: new Date("2026-07-17T08:00:00.000Z"),
        },
        {
          id: crypto.randomUUID(),
          zipFileId: commitZipId,
          projectVersion: 1,
          entryKey: changedFileId,
          computedKind: "changed",
          decisionKind: "changed",
          fileId: changedFileId,
          filename: "changed.pdf",
          oldName: null,
          newName: null,
          bucketPath: changedInputPath,
          sourceSha: "changed-source-sha",
          targetSha: "changed-target-sha",
          sha: null,
          createdAt: new Date("2026-07-17T08:00:00.000Z"),
          updatedAt: new Date("2026-07-17T08:00:00.000Z"),
        },
        {
          id: crypto.randomUUID(),
          zipFileId: commitZipId,
          projectVersion: 1,
          entryKey: renamedFileId,
          computedKind: "renamed",
          decisionKind: "renamed",
          fileId: renamedFileId,
          filename: "new-name.pdf",
          oldName: "old-name.pdf",
          newName: "new-name.pdf",
          bucketPath: null,
          sourceSha: null,
          targetSha: null,
          sha: "renamed-sha",
          createdAt: new Date("2026-07-17T08:00:00.000Z"),
          updatedAt: new Date("2026-07-17T08:00:00.000Z"),
        },
        {
          id: crypto.randomUUID(),
          zipFileId: commitZipId,
          projectVersion: 1,
          entryKey: deletedFileId,
          computedKind: "deleted",
          decisionKind: "deleted",
          fileId: deletedFileId,
          filename: "deleted.pdf",
          oldName: null,
          newName: null,
          bucketPath: null,
          sourceSha: null,
          targetSha: null,
          sha: "deleted-sha",
          createdAt: new Date("2026-07-17T08:00:00.000Z"),
          updatedAt: new Date("2026-07-17T08:00:00.000Z"),
        },
        {
          id: crypto.randomUUID(),
          zipFileId: commitZipId,
          projectVersion: 1,
          entryKey: "new:new.pdf",
          computedKind: "new",
          decisionKind: "new",
          fileId: null,
          filename: "new.pdf",
          oldName: null,
          newName: null,
          bucketPath: newInputPath,
          sourceSha: null,
          targetSha: null,
          sha: "new-sha",
          createdAt: new Date("2026-07-17T08:00:00.000Z"),
          updatedAt: new Date("2026-07-17T08:00:00.000Z"),
        },
      ]);

      const commitRequest = (dryRun: boolean) => ({
        sourceVersion: 1,
        targetVersion: 2,
        lockToken: "dms-commit-lock",
        dryRun: dryRun,
      });
      await setMutationProjectLock(database, {
        projectId: commitProjectId,
        sourceVersion: 1,
        targetVersion: 2,
        lockToken: "dms-commit-lock",
      });
      const beforeDryRunState = await readMutationProjectState(database, commitProjectId);
      const beforeDryRunObjects = await readCommitObjectState();
      const dryRunResponse = await mutateJson(
          `/v2/internal/files/${commitProjectId}/zips/${commitZipId}/commit-diff`,
          mutationRequest("POST", commitRequest(true)),
        );
      expect(dryRunResponse.status).toBe(200);
      expect(parseMutationContract(CommitDiffResponseSchema, dryRunResponse.body)).toEqual({
        dryRun: true,
        new: 1,
        changed: 1,
        renamed: 1,
        unchanged: 1,
      });
      let state = await readMutationProjectState(database, commitProjectId);
      expect(state).toEqual(beforeDryRunState);
      expect(await readCommitObjectState()).toEqual(beforeDryRunObjects);
      expect(await mutationObjectExists(storage, "clean", changedTargetPath)).toBeFalse();
      expect(await mutationObjectExists(storage, "clean", newTargetPath)).toBeFalse();
      expect(await mutationObjectExists(storage, "quarantine", changedTargetPath)).toBeFalse();
      expect(await mutationObjectExists(storage, "quarantine", newTargetPath)).toBeFalse();
      const committedResponse = await mutateJson(
          `/v2/internal/files/${commitProjectId}/zips/${commitZipId}/commit-diff`,
          mutationRequest("POST", commitRequest(false)),
        );
      expect(committedResponse.status).toBe(200);
      expect(parseMutationContract(CommitDiffResponseSchema, committedResponse.body)).toEqual({
        dryRun: false,
        new: 1,
        changed: 1,
        renamed: 1,
        unchanged: 1,
      });
      state = await readMutationProjectState(database, commitProjectId);
      expect(state.files).toHaveLength(8);
      expect(state.files.filter(({ projectVersion }) => projectVersion === 1)).toHaveLength(4);
      expect(state.files.filter(({ projectVersion }) => projectVersion === 2)).toHaveLength(4);
      const targetFiles = state.files.filter(({ projectVersion }) => projectVersion === 2);
      expect(targetFiles.find(({ id }) => id === commitFileId)).toMatchObject({
        filename: "unchanged.pdf",
        bucketPath: commitPath,
        version: 1,
        isDeleted: false,
      });
      expect(targetFiles.find(({ id }) => id === changedFileId)).toMatchObject({
        filename: "changed.pdf",
        bucketPath: changedTargetPath,
        version: 2,
        mimeType: "application/pdf",
        isDeleted: false,
      });
      expect(targetFiles.find(({ id }) => id === renamedFileId)).toMatchObject({
        filename: "new-name.pdf",
        bucketPath: renamedSourcePath,
        version: 1,
        isDeleted: false,
      });
      expect(targetFiles.some(({ id }) => id === deletedFileId)).toBeFalse();
      expect(targetFiles.find(({ filename }) => filename === "new.pdf")).toMatchObject({
        bucketPath: newTargetPath,
        version: 1,
        mimeType: "application/pdf",
        isDeleted: false,
      });
      expect(await readMutationObject(storage, "clean", commitPath)).toEqual({
        bytes: new TextEncoder().encode(mutationScenarios.bytes.diffSource),
        contentType: "application/pdf",
      });
      expect(await readMutationObject(storage, "clean", changedTargetPath)).toEqual({
        bytes: new TextEncoder().encode(mutationScenarios.bytes.diffReplacement),
        contentType: "application/pdf",
      });
      expect(await readMutationObject(storage, "clean", newTargetPath)).toEqual({
        bytes: new TextEncoder().encode(mutationScenarios.bytes.diffNew),
        contentType: "application/pdf",
      });
      expect(state.audit).toHaveLength(0);
      const replayResponse = await mutateJson(
          `/v2/internal/files/${commitProjectId}/zips/${commitZipId}/commit-diff`,
          mutationRequest("POST", commitRequest(false)),
        );
      expect(replayResponse.status).toBe(200);
      expect(parseMutationContract(CommitDiffResponseSchema, replayResponse.body)).toEqual({
        dryRun: false,
        new: 1,
        changed: 1,
        renamed: 1,
        unchanged: 1,
      });
      expect((await readMutationProjectState(database, commitProjectId)).files).toHaveLength(8);

      const beforeLockedState = await readMutationProjectState(database, commitProjectId);
      const beforeLockedObjects = await readCommitObjectState();
      const lockedCommit = await mutateJson(
          `/v2/internal/files/${commitProjectId}/zips/${commitZipId}/commit-diff`,
          mutationRequest("POST", {
            sourceVersion: 1,
            targetVersion: 3,
            lockToken: "locked",
            dryRun: false,
          }),
        );
      expect(lockedCommit.status).toBe(409);
      expect(parseMutationContract(DetailErrorSchema, lockedCommit.body).detail).toContain(
        "does not match the requested version",
      );
      const afterLockedState = await readMutationProjectState(database, commitProjectId);
      expect(afterLockedState).toEqual(beforeLockedState);
      expect(await readCommitObjectState()).toEqual(beforeLockedObjects);
      expect(afterLockedState.files.some(({ projectVersion }) => projectVersion === 3)).toBeFalse();

      const copyPayload = (dryRun: boolean) => ({
        sourceVersion: 1,
        targetVersion: 2,
        lockToken: "dms-node-lock",
        dryRun: dryRun,
        nodes: [
          {
            nodeType: "file",
            id: nodeFileId,
            setOutdated: true,
            overrides: { filename: "node-copy.pdf" },
          },
          { nodeType: "file_topic", id: nodeTopicId },
        ],
      });
      await setMutationProjectLock(database, {
        projectId: nodeProjectId,
        sourceVersion: 1,
        targetVersion: 2,
        lockToken: "dms-node-lock",
      });
      const emptyCopy = await mutateJson(
          `/${nodeProjectId}/copy-version`,
          mutationRequest("POST", { ...copyPayload(false), nodes: [] } as HttpJson),
        );
      expect(emptyCopy.status).toBe(200);
      expect(parseMutationContract(CopyVersionResponseSchema, emptyCopy.body)).toEqual({
        dryRun: false,
        copied: 0,
      });
      state = await readMutationProjectState(database, nodeProjectId);
      expect(state.files).toHaveLength(1);
      expect(state.fileTopics).toHaveLength(1);
      const copyDryRun = await mutateJson(`/${nodeProjectId}/copy-version`, mutationRequest("POST", copyPayload(true) as HttpJson));
      expect(copyDryRun.status).toBe(200);
      expect(parseMutationContract(CopyVersionResponseSchema, copyDryRun.body)).toEqual({
        dryRun: true,
        copied: 2,
      });
      state = await readMutationProjectState(database, nodeProjectId);
      expect(state.files).toHaveLength(1);
      expect(state.fileTopics).toHaveLength(1);
      const copiedResponse = await mutateJson(`/${nodeProjectId}/copy-version`, mutationRequest("POST", copyPayload(false) as HttpJson));
      expect(copiedResponse.status).toBe(200);
      expect(parseMutationContract(CopyVersionResponseSchema, copiedResponse.body)).toEqual({
        dryRun: false,
        copied: 2,
      });
      state = await readMutationProjectState(database, nodeProjectId);
      expect(state.files.find(({ projectVersion }) => projectVersion === 2)).toMatchObject({
        id: nodeFileId,
        filename: "node-copy.pdf",
        isOutdated: true,
      });
      expect(state.fileTopics.find(({ projectVersion }) => projectVersion === 2)).toMatchObject({
        id: nodeTopicId,
        fileId: nodeFileId,
      });
      expect(state.audit).toHaveLength(0);
      const copiedReplay = await mutateJson(`/${nodeProjectId}/copy-version`, mutationRequest("POST", copyPayload(false) as HttpJson));
      expect(copiedReplay.status).toBe(200);
      expect(parseMutationContract(CopyVersionResponseSchema, copiedReplay.body).copied).toBe(2);
      await setMutationProjectLock(database, {
        projectId: nodeProjectId,
        sourceVersion: 1,
        targetVersion: 2,
        lockToken: "dms-node-undo",
      });
      const undoneResponse = await mutateJson(
          `/${nodeProjectId}/undo-version`,
          mutationRequest("POST", { targetVersion: 2, lockToken: "dms-node-undo" }),
        );
      expect(undoneResponse.status).toBe(200);
      const undone = parseMutationContract(UndoVersionResponseSchema, undoneResponse.body);
      expect(undone.deleted).toMatchObject({ file: 1, fileTopic: 1, zipFile: 0 });
      state = await readMutationProjectState(database, nodeProjectId);
      expect(state.files.map(({ projectVersion }) => projectVersion)).toEqual([1]);
      expect(state.fileTopics.map(({ projectVersion }) => projectVersion)).toEqual([1]);
      expect(state.audit).toHaveLength(0);
      const repeatedUndo = await mutateJson(
          `/${nodeProjectId}/undo-version`,
          mutationRequest("POST", { targetVersion: 2, lockToken: "dms-node-undo" }),
        );
      expect(repeatedUndo.status).toBe(200);
      expect(
        parseMutationContract(UndoVersionResponseSchema, repeatedUndo.body).deleted,
      ).toMatchObject({
        file: 0,
        fileTopic: 0,
        zipFile: 0,
      });

      await database.db.insert(files).values({
        id: nodeFileId,
        ...nodeValues(nodeProjectId, 2),
        type: "DOCUMENT",
        filename: "partial-target.pdf",
        mimeType: "application/pdf",
        version: 1,
        bucketPath: nodePath,
        addedInVersion: 1,
        workflowId: null,
        runId: null,
        vectorSearchable: false,
        sourceZipFileId: null,
        workflowStatus: "COMPLETED",
      });
      await setMutationProjectLock(database, {
        projectId: nodeProjectId,
        sourceVersion: 1,
        targetVersion: 2,
        lockToken: "dms-node-lock",
      });
      const partialTarget = await mutateJson(`/${nodeProjectId}/copy-version`, mutationRequest("POST", copyPayload(false) as HttpJson));
      expect(partialTarget.status).toBe(409);
      expect(parseMutationContract(DetailErrorSchema, partialTarget.body).detail).toContain(
        "target rows already exist",
      );
      state = await readMutationProjectState(database, nodeProjectId);
      expect(state.files.filter(({ projectVersion }) => projectVersion === 2)).toHaveLength(1);
      expect(state.fileTopics.filter(({ projectVersion }) => projectVersion === 2)).toHaveLength(0);
    } finally {
      await cleanupScenario(database, storage, projectIds, objects);
    }
  });
});
