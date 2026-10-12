import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import mutationScenarios from "../../fixtures/mutation-scenarios.json";
import {
  DetailErrorSchema,
  FileResponseSchema,
  ZipFileResponseSchema,
  parseMutationContract,
} from "../support/mutation-contracts.ts";
import {
  assertMutationProjectsAbsent,
  cleanupMutationProjects,
  createMutationDatabase,
  readMutationProjectState,
  seedMutationProjects,
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
const externalTest = process.env.DMS_MUTATION_BASE_URL === undefined ? describe.skip : describe;

const ACTOR_ID = "82000000-0000-4000-8000-000000000001";
const AUDIT_HEADERS = {
  "X-Actor-User-Id": ACTOR_ID,
  "X-Request-Id": "dms-signed-file-lifecycle",
  "X-Request-Starttime": "2026-07-17T08:00:00.000Z",
};

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
    throw new AggregateError(failures, "DMS signed-file lifecycle cleanup failed");
  }
}

externalTest("Document Management signed-file confirmation lifecycle", () => {
  let database: MutationDatabase;
  let storage: MutationStorage;

  beforeAll(async () => {
    database = createMutationDatabase();
    storage = createMutationStorage();
  });

  afterAll(async () => {
    await database.client.close();
  });

  test("confirms public document and ZIP uploads with exact persistence and placement", async () => {
    const projectId = crypto.randomUUID();
    const zipProjectId = crypto.randomUUID();
    const missingProjectId = crypto.randomUUID();
    const filename = `signed-${projectId}.pdf`;
    const zipFilename = `signed-${zipProjectId}.zip`;
    const missingFilename = `missing-${missingProjectId}.pdf`;
    const objectPath = `documents/${projectId}/v1/${filename}`;
    const zipPath = `zips/${zipProjectId}/v1/${zipFilename}`;
    const missingPath = `documents/${missingProjectId}/v1/${missingFilename}`;
    const projectIds = [projectId, zipProjectId, missingProjectId];
    const objects = [
      { bucket: "quarantine" as const, path: objectPath },
      { bucket: "clean" as const, path: objectPath },
      { bucket: "quarantine" as const, path: zipPath },
      { bucket: "clean" as const, path: zipPath },
      { bucket: "quarantine" as const, path: missingPath },
      { bucket: "clean" as const, path: missingPath },
    ];


    try {
      await seedMutationProjects(database, projectIds.map((id) => ({ id, projectVersion: 1 })));
      await putMutationObject(
        storage,
        "quarantine",
        objectPath,
        mutationScenarios.bytes.publicDocument,
        "application/pdf",
      );
      await putMutationObject(
        storage,
        "quarantine",
        zipPath,
        mutationScenarios.bytes.publicZip,
        "application/zip",
      );
      const documentResponse = await mutateJson(
          "/v2/files/confirm-upload?projectVersion=1",
          mutationRequest(
            "POST",
            { type: "document", projectId, filename, createNewVersion: false },
            AUDIT_HEADERS,
          ),
        );
      expect(documentResponse.status).toBe(200);
      const document = parseMutationContract(ZipFileResponseSchema, documentResponse.body);
      expect(document).toMatchObject({
        type: "document",
        filename,
        bucketPath: objectPath,
        projectId,
        workflowStatus: "PENDING",
        approvalStatus: null,
        sourceProjectVersion: null,
      });

      let state = await readMutationProjectState(database, projectId);
      expect(state.files).toHaveLength(1);
      expect(state.files[0]).toMatchObject({
        id: document.id,
        type: "DOCUMENT",
        filename,
        mimeType: "application/pdf",
        version: 1,
        projectVersion: 1,
        bucketPath: objectPath,
        workflowStatus: "PENDING",
      });
      expect(state.audit).toHaveLength(1);
      expect(state.audit[0]).toMatchObject({
        projectId,
        entityId: document.id,
        entityType: "file",
        changeType: "create",
        actorUserId: ACTOR_ID,
      });
      expect(await mutationObjectExists(storage, "clean", objectPath)).toBeFalse();
      expect(await readMutationObject(storage, "quarantine", objectPath)).toEqual({
        bytes: new TextEncoder().encode(mutationScenarios.bytes.publicDocument),
        contentType: "application/pdf",
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
      expect(parseMutationContract(DetailErrorSchema, duplicate.body).detail).toContain(
        "already exists",
      );
      state = await readMutationProjectState(database, projectId);
      expect(state.files).toHaveLength(1);
      expect(await mutationObjectExists(storage, "quarantine", objectPath)).toBeTrue();
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
      const zip = parseMutationContract(ZipFileResponseSchema, zipResponse.body);
      expect(zip).toMatchObject({
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
        id: zip.id,
        type: "ZIP",
        filename: zipFilename,
        projectVersion: 1,
        bucketPath: zipPath,
        workflowStatus: "PENDING",
      });
      expect(zipState.audit).toHaveLength(1);
      expect(await mutationObjectExists(storage, "clean", zipPath)).toBeFalse();
      expect(await readMutationObject(storage, "quarantine", zipPath)).toEqual({
        bytes: new TextEncoder().encode(mutationScenarios.bytes.publicZip),
        contentType: "application/zip",
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
      expect(parseMutationContract(DetailErrorSchema, missing.body).detail).toContain(
        "Uploaded file not found",
      );
      expect(
        Object.values(await readMutationProjectState(database, missingProjectId)).every(
          (rows) => rows.length === 0,
        ),
      ).toBeTrue();
    } finally {
      await cleanupScenario(database, storage, projectIds, objects);
    }
  });

  test("confirms internal clean uploads and rejects forwarded authorization before effects", async () => {
    const projectId = crypto.randomUUID();
    const filename = `content-${projectId}.json`;
    const objectPath = `content_extraction/${projectId}/v1/${filename}`;
    const objects = [
      { bucket: "clean" as const, path: objectPath },
      { bucket: "quarantine" as const, path: objectPath },
    ];

    try {
      await seedMutationProjects(database, [{ id: projectId, projectVersion: 1 }]);
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
        mimeType: "application/json;charset=utf-8",
        workflowId: null,
        runId: null,
      });
      const state = await readMutationProjectState(database, projectId);
      expect(state.files).toHaveLength(1);
      expect(state.files[0]).toMatchObject({
        id: confirmed.id,
        type: "CONTENT_EXTRACTION",
        filename,
        bucketPath: objectPath,
        projectVersion: 1,
        workflowStatus: null,
      });
      expect(state.audit).toHaveLength(1);
      expect(state.audit[0]).toMatchObject({
        projectId,
        entityId: confirmed.id,
        entityType: "file",
        changeType: "create",
        actorUserId: ACTOR_ID,
      });
      expect(await mutationObjectExists(storage, "quarantine", objectPath)).toBeFalse();
      expect(await readMutationObject(storage, "clean", objectPath)).toEqual({
        bytes: new TextEncoder().encode(mutationScenarios.bytes.internalDocument),
        contentType: "application/json;charset=utf-8",
      });
    } finally {
      await cleanupScenario(database, storage, [projectId], objects);
    }
  });
});
