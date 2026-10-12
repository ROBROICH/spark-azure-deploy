import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Value } from "@sinclair/typebox/value";

import { TocResultSchema } from "../../src/schemas.ts";

import {
  assertScenarioAbsent,
  cleanupMutationScenario,
  createMutationDatabase,
  readProjectState,
  seedCoreProject,
  setCoreVersionLock,
  type MutationDatabase,
} from "../support/mutation-database.ts";
import {
  CopyVersionResponseSchema,
  DetailErrorSchema,
  NodeMutationResponseSchema,
  TocNoteListResponseSchema,
  TocNoteResponseSchema,
  UndoVersionResponseSchema,
  parseMutationContract,
} from "../support/mutation-contracts.ts";
import { mutateJson, mutationRequest } from "../support/mutation-http.ts";

const describeMutationTests = process.env.FCS_MUTATION_BASE_URL === undefined ? describe.skip : describe;
const NO_TOC_RESULT = {
  inhaltsverzeichnisExtractionOutput: {
    status: "no_inhaltsverzeichnis_found",
    metadata: null,
  },
  inhaltsverzeichnisMatchingOutput: { matchedDocumentTypes: [] },
};

test("accepts a completed TOC result when no table of contents was found", () => {
  const result = Value.Parse(TocResultSchema, NO_TOC_RESULT);

  expect(result.inhaltsverzeichnisExtractionOutput).toEqual({
    status: "no_inhaltsverzeichnis_found",
    metadata: null,
  });
});

const ACTOR = "82000000-0000-4000-8000-000000000001";
const TRIGGERED_BY = "82000000-0000-4000-8000-000000000002";
const AUDIT_HEADERS = {
  "X-Actor-User-Id": ACTOR,
  "X-Triggered-By-User-Id": TRIGGERED_BY,
  "X-Workflow-Run-Id": "fcs-mutation-test-run",
  "X-Workflow-Type": "FormalCompletenessMutationTest",
  "X-Request-Id": "fcs-mutation-test-request",
  "X-Request-Starttime": "2026-07-17T01:02:03.456Z",
};

describeMutationTests("Formal Completeness HTTP mutation contract", () => {
  let database: MutationDatabase;

  beforeAll(async () => {
    database = createMutationDatabase();
    await database.ready();
  });

  afterAll(async () => {
    await database.close();
  });

  test("preserves TOC creation, resolution, ownership, and audit", async () => {
    const projectId = crypto.randomUUID();
    const wrongProjectId = crypto.randomUUID();
    await assertScenarioAbsent(database, { projectIds: [projectId, wrongProjectId] });
    await Promise.all([
      seedCoreProject(database, projectId),
      seedCoreProject(database, wrongProjectId),
    ]);

    try {
      const createdResponse = await mutateJson(
        `/${projectId}/toc-notes`,
        mutationRequest("POST", [
          { content: "Missing environmental report" },
          { content: "Missing site plan" },
        ], AUDIT_HEADERS),
      );
      expect(createdResponse.status).toBe(201);
      const created = parseMutationContract(TocNoteListResponseSchema, createdResponse.body);
      expect(created).toHaveLength(2);
      const firstNote = created[0]!;

      const resolvedResponse = await mutateJson(
        `/${projectId}/toc-notes/${firstNote.id}`,
        mutationRequest("PATCH", { isResolved: true }, AUDIT_HEADERS),
      );
      expect(resolvedResponse.status).toBe(200);
      expect(parseMutationContract(TocNoteResponseSchema, resolvedResponse.body)).toMatchObject({
        id: firstNote.id,
        projectId,
        content: "Missing environmental report",
        isResolved: true,
      });

      const wrongProject = await mutateJson(
        `/${wrongProjectId}/toc-notes/${firstNote.id}`,
        mutationRequest("PATCH", { isResolved: false }, AUDIT_HEADERS),
      );
      expect(wrongProject.status).toBe(404);
      expect(wrongProject.body).toEqual({
        detail: `TOC note with id=${firstNote.id} not found for projectId=${wrongProjectId}`,
      });

      const state = await readProjectState(database, projectId);
      expect(state.tocNotes).toHaveLength(2);
      expect(state.tocNotes.find(({ id }) => id === firstNote.id)?.isResolved).toBe(true);
      expect(state.audit).toHaveLength(3);
      expect(state.audit.filter(({ changeType }) => changeType === "create").map(
        ({ entityId, actorUserId }) => ({ entityId, actorUserId }),
      )).toEqual(expect.arrayContaining(created.map(({ id }) => ({ entityId: id, actorUserId: ACTOR }))));
      expect(state.audit.find(({ changeType }) => changeType === "update")).toMatchObject({
        projectId,
        entityId: firstNote.id,
        entityType: "table_of_content_notes",
        changeType: "update",
        actorUserId: ACTOR,
        triggeredByUserId: TRIGGERED_BY,
        workflowRunId: "fcs-mutation-test-run",
      });
    } finally {
      await cleanupMutationScenario(database, { projectIds: [projectId, wrongProjectId] });
    }
    await assertScenarioAbsent(database, { projectIds: [projectId, wrongProjectId] });
  });

  test("preserves six-node graph writes, atomic rollback, version copy, and failed-version undo", async () => {
    const projectId = crypto.randomUUID();
    const categoryId = crypto.randomUUID();
    const documentTypeId = crypto.randomUUID();
    const documentId = crypto.randomUUID();
    const fileId = crypto.randomUUID();
    const contentExtractionId = crypto.randomUUID();
    const projectTemplateVersionId = crypto.randomUUID();
    const projectTypeId = crypto.randomUUID();
    const tocNoteId = crypto.randomUUID();
    const tocStatusId = crypto.randomUUID();
    const rolledBackNoteId = crypto.randomUUID();
    const missingDocumentId = crypto.randomUUID();
    await assertScenarioAbsent(database, { projectIds: [projectId] });
    await seedCoreProject(database, projectId);

    const commonPayload = {
      frontendParentIds: ["frontend:formal-test"],
      isOutdated: false,
      updateType: "manual",
    };

    try {
      const insertedResponse = await mutateJson(
        `/${projectId}/update?projectVersion=1`,
        mutationRequest(
          "POST",
          {
            inserts: [
              {
                nodeType: "category",
                id: categoryId,
                payload: { ...commonPayload, name: "Graph documents" },
              },
              {
                nodeType: "document_type",
                id: documentTypeId,
                payload: {
                  ...commonPayload,
                  categoryId: categoryId,
                  name: "Graph application",
                  description: "Required graph document",
                  confidence: 0.8,
                  isResolved: false,
                  origin: "system",
                },
              },
              {
                nodeType: "document",
                id: documentId,
                payload: {
                  ...commonPayload,
                  fileId: fileId,
                  contentExtractionId: contentExtractionId,
                  aiSuggestedRequiredDocumentTypeId: documentTypeId,
                  humanRequiredDocumentTypeId: null,
                  documentName: "graph-application.pdf",
                  reasoning: "Graph insertion fixture",
                  confidence: 0.81,
                },
              },
              {
                nodeType: "project_template_version",
                id: projectTemplateVersionId,
                payload: {
                  ...commonPayload,
                  version: 1,
                  projectTypeId: projectTypeId,
                },
              },
              {
                nodeType: "table_of_content_notes",
                id: tocNoteId,
                payload: {
                  ...commonPayload,
                  content: "Graph-created missing document",
                  isResolved: false,
                },
              },
              {
                nodeType: "toc_job_status",
                id: tocStatusId,
                payload: { ...commonPayload, status: "success" },
              },
            ],
            updates: [],
            deletes: [],
          },
          AUDIT_HEADERS,
        ),
      );
      expect(insertedResponse.status).toBe(200);
      const inserted = parseMutationContract(NodeMutationResponseSchema, insertedResponse.body);
      expect(inserted.inserted.map(({ nodeType, id }) => ({ nodeType, id }))).toEqual([
        { nodeType: "category", id: categoryId },
        { nodeType: "document_type", id: documentTypeId },
        { nodeType: "document", id: documentId },
        { nodeType: "project_template_version", id: projectTemplateVersionId },
        { nodeType: "table_of_content_notes", id: tocNoteId },
        { nodeType: "toc_job_status", id: tocStatusId },
      ]);
      expect(inserted.updated).toEqual([]);
      expect(inserted.deleted).toEqual([]);

      let state = await readProjectState(database, projectId);
      expect({
        categories: state.categories.length,
        documentTypes: state.documentTypes.length,
        documents: state.documents.length,
        projectTemplateVersions: state.projectTemplateVersions.length,
        tocNotes: state.tocNotes.length,
        tocStatuses: state.tocStatuses.length,
      }).toEqual({
        categories: 1,
        documentTypes: 1,
        documents: 1,
        projectTemplateVersions: 1,
        tocNotes: 1,
        tocStatuses: 1,
      });
      expect(state.documentTypes[0]).toMatchObject({
        id: documentTypeId,
        categoryId,
        updateType: "MANUAL",
      });
      expect(state.documents[0]).toMatchObject({
        id: documentId,
        fileId,
        contentExtractionId,
        aiDocumentTypeId: documentTypeId,
        humanDocumentTypeId: null,
      });
      expect(state.audit).toHaveLength(6);
      expect(new Set(state.audit.map(({ entityType }) => entityType))).toEqual(
        new Set([
          "category",
          "document_type",
          "document",
          "project_template_version",
          "table_of_content_notes",
          "toc_job_status",
        ]),
      );
      const conflict = await mutateJson(
        `/${projectId}/update?projectVersion=1`,
        mutationRequest("POST", {
          inserts: [],
          updates: [
            {
              nodeType: "category",
              id: categoryId,
              payload: { name: "Must not persist" },
            },
          ],
          deletes: [{ nodeType: "category", id: categoryId }],
        }),
      );
      expect(conflict.status).toBe(400);
      expect(parseMutationContract(DetailErrorSchema, conflict.body).detail).toContain(
        "Same node targeted by multiple mutation kinds",
      );
      const rollback = await mutateJson(
        `/${projectId}/update?projectVersion=1`,
        mutationRequest("POST", {
          inserts: [
            {
              nodeType: "table_of_content_notes",
              id: rolledBackNoteId,
              payload: {
                ...commonPayload,
                content: "Must roll back",
                isResolved: false,
              },
            },
          ],
          updates: [
            {
              nodeType: "document",
              id: missingDocumentId,
              payload: { documentName: "Missing" },
            },
          ],
          deletes: [],
        }),
      );
      expect(rollback.status).toBe(404);
      expect(parseMutationContract(DetailErrorSchema, rollback.body).detail).toContain(
        "Update batch affected fewer rows than expected",
      );
      state = await readProjectState(database, projectId);
      expect(state.tocNotes.map(({ id }) => id)).not.toContain(rolledBackNoteId);
      expect(state.audit).toHaveLength(6);
      const changedResponse = await mutateJson(
        `/${projectId}/update?projectVersion=1`,
        mutationRequest(
          "POST",
          {
            inserts: [],
            updates: [
              {
                nodeType: "category",
                id: categoryId,
                payload: { name: "Reviewed graph documents" },
              },
              {
                nodeType: "document_type",
                id: documentTypeId,
                payload: { confidence: null, isResolved: true },
              },
            ],
            deletes: [{ nodeType: "table_of_content_notes", id: tocNoteId }],
          },
          AUDIT_HEADERS,
        ),
      );
      expect(changedResponse.status).toBe(200);
      const changed = parseMutationContract(NodeMutationResponseSchema, changedResponse.body);
      expect(changed.updated).toHaveLength(2);
      expect(changed.deleted).toEqual([{ nodeType: "table_of_content_notes", id: tocNoteId }]);
      state = await readProjectState(database, projectId);
      expect(state.categories[0]?.name).toBe("Reviewed graph documents");
      expect(state.documentTypes[0]).toMatchObject({ confidence: null, isResolved: true });
      expect(state.tocNotes[0]?.isDeleted).toBe(true);
      expect(state.categoryHistory).toHaveLength(1);
      expect(state.documentTypeHistory).toHaveLength(1);
      expect(state.tocNoteHistory).toHaveLength(1);
      expect(state.audit).toHaveLength(9);

      const copyNodes = [
        {
          nodeType: "category",
          id: categoryId,
          setOutdated: true,
          overrides: { name: "Copied graph documents" },
        },
        { nodeType: "document_type", id: documentTypeId },
        {
          nodeType: "document",
          id: documentId,
          overrides: { documentName: "copied-graph-application.pdf" },
        },
      ];
      await setCoreVersionLock(database, projectId, {
        sourceVersion: 1,
        targetVersion: 2,
        lockToken: "formal-copy-lock",
      });
      const dryRun = await mutateJson(
        `/${projectId}/copy-version`,
        mutationRequest("POST", {
          sourceVersion: 1,
          targetVersion: 2,
          lockToken: "formal-copy-lock",
          dryRun: true,
          nodes: copyNodes,
        }),
      );
      expect(dryRun.status).toBe(200);
      expect(parseMutationContract(CopyVersionResponseSchema, dryRun.body)).toEqual({
        dryRun: true,
        copied: 3,
      });
      const committedCopy = await mutateJson(
        `/${projectId}/copy-version`,
        mutationRequest("POST", {
          sourceVersion: 1,
          targetVersion: 2,
          lockToken: "formal-copy-lock",
          dryRun: false,
          nodes: copyNodes,
        }),
      );
      expect(committedCopy.status).toBe(200);
      expect(parseMutationContract(CopyVersionResponseSchema, committedCopy.body)).toEqual({
        dryRun: false,
        copied: 3,
      });
      state = await readProjectState(database, projectId);
      expect(
        state.categories.find(
          ({ id, projectVersion }) => id === categoryId && projectVersion === 2,
        ),
      ).toMatchObject({ name: "Copied graph documents", isOutdated: true });
      expect(
        state.documentTypes.find(
          ({ id, projectVersion }) => id === documentTypeId && projectVersion === 2,
        ),
      ).toMatchObject({ categoryId, isResolved: true });
      expect(
        state.documents.find(({ id, projectVersion }) => id === documentId && projectVersion === 2),
      ).toMatchObject({
        documentName: "copied-graph-application.pdf",
        aiDocumentTypeId: documentTypeId,
      });
      const locked = await mutateJson(
        `/${projectId}/update?projectVersion=1`,
        mutationRequest("POST", {
          inserts: [],
          updates: [{ nodeType: "category", id: categoryId, payload: { name: "Blocked" } }],
          deletes: [],
        }),
      );
      expect(locked.status).toBe(409);
      expect(parseMutationContract(DetailErrorSchema, locked.body).detail).toContain(
        "active version creation lock",
      );
      await setCoreVersionLock(database, projectId, {
        sourceVersion: 1,
        targetVersion: 2,
        lockToken: "formal-undo-lock",
      });
      const undone = await mutateJson(
        `/${projectId}/undo-version`,
        mutationRequest("POST", {
          targetVersion: 2,
          lockToken: "formal-undo-lock",
        }),
      );
      expect(undone.status).toBe(200);
      const undoBody = parseMutationContract(UndoVersionResponseSchema, undone.body);
      expect(undoBody.deleted).toMatchObject({ category: 1, documentType: 1, document: 1 });
      expect(Object.values(undoBody.deleted).reduce((sum, count) => sum + count, 0)).toBe(3);
      state = await readProjectState(database, projectId);
      expect(
        [
          ...state.categories,
          ...state.documentTypes,
          ...state.documents,
          ...state.projectTemplateVersions,
          ...state.tocNotes,
          ...state.tocStatuses,
        ].filter(({ projectVersion }) => projectVersion === 2),
      ).toEqual([]);
      expect(
        [...state.categoryHistory, ...state.documentTypeHistory, ...state.documentHistory].filter(
          ({ projectVersion }) => projectVersion === 2,
        ),
      ).toHaveLength(3);
    } finally {
      await cleanupMutationScenario(database, { projectIds: [projectId] });
    }
    await assertScenarioAbsent(database, { projectIds: [projectId] });
  });
});
