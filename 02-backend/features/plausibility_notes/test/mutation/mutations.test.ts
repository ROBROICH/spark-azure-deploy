import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import {
  assertMutationScenarioAbsent,
  cleanupMutationScenario,
  clearCoreVersionLock,
  createMutationDatabase,
  readProjectState,
  seedCoreProjectVersion,
  seedPlausibilityResult,
  setCoreVersionLock,
  type MutationDatabase,
} from "../support/mutation-database.ts";
import {
  CopyVersionResponseSchema,
  DetailErrorSchema,
  ProcessNodeChangesResponseSchema,
  SuccessResponseSchema,
  UndoVersionResponseSchema,
  ValidationErrorSchema,
  parseMutationContract,
} from "../support/mutation-contracts.ts";
import { mutateJson, mutationRequest } from "../support/mutation-http.ts";
import { NodeListSchema, parseReadContract } from "../support/read-contracts.ts";
import { readJson } from "../support/external-app.ts";

const describeMutationTests =
  process.env.PLAUSIBILITY_BASE_URL === undefined ||
  process.env.PLAUSIBILITY_MUTATION_DATABASE_URL === undefined
    ? describe.skip
    : describe;

const ACTOR = "8a000000-0000-4000-8000-000000000001";
const TRIGGERED_BY = "8a000000-0000-4000-8000-000000000002";
const REQUEST_ID = "8a000000-0000-4000-8000-000000000003";
const AUDIT_HEADERS = {
  "X-Actor-User-Id": ACTOR,
  "X-Triggered-By-User-Id": TRIGGERED_BY,
  "X-Workflow-Run-Id": "plausibility-mutation-run",
  "X-Workflow-Type": "PlausibilityMutationTest",
  "X-Request-Starttime": "2026-07-17T03:04:05.678Z",
  "X-Request-Id": REQUEST_ID,
};

interface Contradiction {
  id: string;
  title: string | null;
  description: string;
  rating: number | null;
  status: "OPEN" | "RESOLVED" | "IGNORED";
  occurrences: Array<{
    documentId: string;
    documentName: string | null;
    contentExcerpt: string;
    pageNumber: number | null;
  }>;
}

const contradiction = (
  id: string,
  status: Contradiction["status"],
  documentId: string,
): Contradiction => ({
  id,
  title: `Title ${id.slice(0, 8)}`,
  description: `Synthetic contradiction ${id}`,
  rating: 50,
  status,
  occurrences: [
    {
      documentId,
      documentName: `Document ${documentId}`,
      contentExcerpt: `Excerpt for ${documentId}`,
      pageNumber: 3,
    },
  ],
});

describeMutationTests("Plausibility HTTP mutation contract", () => {
  let database: MutationDatabase;

  beforeAll(async () => {
    database = createMutationDatabase();
    await database.ready();
  });

  afterAll(async () => {
    await database.close();
  });

  test("preserves latest-version note status changes, locks, and deletion", async () => {
    const projectId = crypto.randomUUID();
    const versionedDeleteId = crypto.randomUUID();
    const openId = crypto.randomUUID();
    const resolvedId = crypto.randomUUID();
    const ignoredId = crypto.randomUUID();
    const oldOnlyId = crypto.randomUUID();
    const lockedDeleteId = crypto.randomUUID();
    await assertMutationScenarioAbsent(database, [projectId]);
    await seedCoreProjectVersion(database, projectId, 1);
    await seedCoreProjectVersion(database, projectId, 2);
    await seedPlausibilityResult(database, projectId, 1, {
      contradictions: [
        contradiction(versionedDeleteId, "OPEN", "note-v1-delete-document"),
        contradiction(oldOnlyId, "IGNORED", "note-v1-only-document"),
      ],
    });
    await seedPlausibilityResult(database, projectId, 2, {
      contradictions: [
        contradiction(versionedDeleteId, "RESOLVED", "note-v2-delete-document"),
        contradiction(openId, "OPEN", "note-open-document"),
        contradiction(resolvedId, "RESOLVED", "note-resolved-document"),
        contradiction(ignoredId, "IGNORED", "note-ignored-document"),
        contradiction(lockedDeleteId, "OPEN", "note-locked-delete-document"),
      ],
    });

    try {
      for (const [noteId, to] of [
        [openId, "RESOLVED"],
        [resolvedId, "IGNORED"],
        [ignoredId, "OPEN"],
      ] as const) {
        const response = await mutateJson(
          `/plausibility-notes/notes/${noteId}`,
          mutationRequest("PATCH", { status: to }, AUDIT_HEADERS),
        );
        expect(response.status).toBe(200);
        expect(parseMutationContract(SuccessResponseSchema, response.body)).toEqual({
          success: true,
        });
        expect(
          (await readProjectState(database, projectId)).notes.find(
            ({ id, projectVersion }) => id === noteId && projectVersion === 2,
          )?.status,
        ).toBe(to);
      }

      const beforeValidation = await readProjectState(database, projectId);
      const invalidStatus = await mutateJson(
        `/plausibility-notes/notes/${openId}`,
        mutationRequest("PATCH", { status: "CLOSED" }),
      );
      expect(invalidStatus.status).toBe(422);
      expect(
        parseMutationContract(ValidationErrorSchema, invalidStatus.body).detail.some(({ loc }) =>
          loc.includes("status"),
        ),
      ).toBeTrue();
      expect(await readProjectState(database, projectId)).toEqual(beforeValidation);

      const missingId = crypto.randomUUID();
      for (const method of ["PATCH", "DELETE"] as const) {
        const missing = await mutateJson(
          `/plausibility-notes/notes/${missingId}`,
          mutationRequest(method, method === "PATCH" ? { status: "OPEN" } : undefined),
        );
        expect(missing.status).toBe(404);
        expect(
          parseMutationContract(DetailErrorSchema, missing.body).detail.length,
        ).toBeGreaterThan(0);
      }

      const oldOnly = await mutateJson(
        `/plausibility-notes/notes/${oldOnlyId}`,
        mutationRequest("PATCH", { status: "RESOLVED" }),
      );
      expect(oldOnly.status).toBe(404);
      expect(
        (await readProjectState(database, projectId)).notes.find(
          ({ id, projectVersion }) => id === oldOnlyId && projectVersion === 1,
        )?.status,
      ).toBe("IGNORED");

      const beforeLockedUpdate = await readProjectState(database, projectId);
      await setCoreVersionLock(database, projectId, {
        sourceVersion: 2,
        targetVersion: 3,
        lockToken: `lock-${crypto.randomUUID()}`,
      });
      const lockedUpdate = await mutateJson(
        `/plausibility-notes/notes/${openId}`,
        mutationRequest("PATCH", { status: "OPEN" }, AUDIT_HEADERS),
      );
      expect(lockedUpdate.status).toBe(409);
      expect(await readProjectState(database, projectId)).toEqual(beforeLockedUpdate);
      await clearCoreVersionLock(database, projectId);

      const deleted = await mutateJson(
        `/plausibility-notes/notes/${versionedDeleteId}`,
        mutationRequest("DELETE", undefined, AUDIT_HEADERS),
      );
      expect(deleted.status).toBe(200);
      expect(parseMutationContract(SuccessResponseSchema, deleted.body)).toEqual({ success: true });
      let state = await readProjectState(database, projectId);
      expect(
        state.notes.some(
          ({ id, projectVersion }) => id === versionedDeleteId && projectVersion === 2,
        ),
      ).toBeFalse();
      expect(
        state.notes.some(
          ({ id, projectVersion }) => id === versionedDeleteId && projectVersion === 1,
        ),
      ).toBeTrue();
      expect(
        state.noteHistory.some(
          ({ id, projectVersion }) => id === versionedDeleteId && projectVersion === 2,
        ),
      ).toBeTrue();

      const beforeLockedDelete = state;
      await setCoreVersionLock(database, projectId, {
        sourceVersion: 2,
        targetVersion: 3,
        lockToken: `lock-${crypto.randomUUID()}`,
      });
      const lockedDelete = await mutateJson(
        `/plausibility-notes/notes/${lockedDeleteId}`,
        mutationRequest("DELETE", undefined, AUDIT_HEADERS),
      );
      expect(lockedDelete.status).toBe(409);
      state = await readProjectState(database, projectId);
      expect(state).toEqual(beforeLockedDelete);
    } finally {
      await cleanupMutationScenario(database, [projectId]);
    }
    await assertMutationScenarioAbsent(database, [projectId]);
  });

  test("preserves atomic node writes, copy, undo, audit, parents, and locks", async () => {
    const projectId = crypto.randomUUID();
    const updateId = crypto.randomUUID();
    const deleteId = crypto.randomUUID();
    const insertedNoteId = crypto.randomUUID();
    const insertedOccurrenceId = crypto.randomUUID();
    const missingParentId = crypto.randomUUID();
    const failedOccurrenceId = crypto.randomUUID();
    const copyMissingId = crypto.randomUUID();
    const lockToken = `lock-${crypto.randomUUID()}`;
    await assertMutationScenarioAbsent(database, [projectId]);
    await seedCoreProjectVersion(database, projectId, 1);
    await seedPlausibilityResult(database, projectId, 1, {
      contradictions: [
        contradiction(updateId, "OPEN", "node-update-document"),
        contradiction(deleteId, "IGNORED", "node-delete-document"),
      ],
    });

    try {
      const seeded = await readProjectState(database, projectId);
      const deleteOccurrence = seeded.occurrences.find(
        ({ plausibilityNoteId }) => plausibilityNoteId === deleteId,
      );
      expect(deleteOccurrence).toBeDefined();

      const mixed = await mutateJson(
        `/${projectId}/update?projectVersion=1`,
        mutationRequest(
          "POST",
          {
            inserts: [
              {
                nodeType: "plausibility_note",
                id: insertedNoteId,
                payload: {
                  title: "Inserted through node CRUD",
                  description: "A generated node mutation note",
                  rating: 77,
                  status: "OPEN",
                  frontendParentIds: ["frontend-inserted-note"],
                  updateType: "manual",
                  isOutdated: false,
                },
              },
              {
                nodeType: "plausibility_note_occurrence",
                id: insertedOccurrenceId,
                payload: {
                  plausibilityNoteId: insertedNoteId,
                  documentId: "node-inserted-document",
                  documentName: "Inserted node document",
                  contentExcerpt: "Inserted occurrence excerpt",
                  pageNumber: 8,
                  frontendParentIds: ["frontend-inserted-occurrence"],
                  updateType: "manual",
                  isOutdated: false,
                },
              },
            ],
            updates: [
              {
                nodeType: "plausibility_note",
                id: updateId,
                payload: { title: null, rating: null, status: "RESOLVED" },
              },
            ],
            deletes: [
              { nodeType: "plausibility_note_occurrence", id: deleteOccurrence!.id },
              { nodeType: "plausibility_note", id: deleteId },
            ],
          },
          AUDIT_HEADERS,
        ),
      );
      expect(mixed.status).toBe(200);
      const mixedBody = parseMutationContract(ProcessNodeChangesResponseSchema, mixed.body);
      expect(mixedBody.inserted.map(({ id }) => id)).toEqual([
        insertedNoteId,
        insertedOccurrenceId,
      ]);
      expect(mixedBody.updated[0]).toMatchObject({
        id: updateId,
        title: null,
        rating: null,
        status: "RESOLVED",
      });
      expect(new Set(mixedBody.deleted.map(({ id }) => id))).toEqual(
        new Set([deleteOccurrence!.id, deleteId]),
      );

      let state = await readProjectState(database, projectId);
      expect(state.notes.find(({ id }) => id === insertedNoteId)).toMatchObject({
        status: "OPEN",
        updateType: "MANUAL",
        isDeleted: false,
      });
      expect(state.notes.find(({ id }) => id === deleteId)?.isDeleted).toBeTrue();
      expect(state.audit).toHaveLength(5);
      for (const audit of state.audit) {
        expect(audit).toMatchObject({
          projectId,
          actorUserId: ACTOR,
          triggeredByUserId: TRIGGERED_BY,
          workflowRunId: "plausibility-mutation-run",
          workflowType: "PlausibilityMutationTest",
        });
      }

      const nodeList = await readJson(`/${projectId}/nodes?projectVersion=1`);
      expect(nodeList.status).toBe(200);
      const parsedNodes = parseReadContract(NodeListSchema, nodeList.body);
      expect(
        new Set(
          parsedNodes.nodes
            .find(({ id }) => id === insertedOccurrenceId)
            ?.parents.map(({ id, nodeType }) => `${nodeType}:${id}`),
        ),
      ).toEqual(new Set([`file:node-inserted-document`, `plausibility_note:${insertedNoteId}`]));

      const beforeAtomicFailure = await readProjectState(database, projectId);
      const atomicFailure = await mutateJson(
        `/${projectId}/update?projectVersion=1`,
        mutationRequest("POST", {
          inserts: [
            {
              nodeType: "plausibility_note_occurrence",
              id: failedOccurrenceId,
              payload: {
                plausibilityNoteId: missingParentId,
                documentId: "missing-parent-document",
                documentName: null,
                contentExcerpt: "This transaction must roll back",
                pageNumber: null,
              },
            },
          ],
          updates: [],
          deletes: [],
        }),
      );
      expect(atomicFailure.status).toBe(409);
      expect(await readProjectState(database, projectId)).toEqual(beforeAtomicFailure);

      await setCoreVersionLock(database, projectId, {
        sourceVersion: 1,
        targetVersion: 2,
        lockToken,
      });
      const lockedWrite = await mutateJson(
        `/${projectId}/update?projectVersion=1`,
        mutationRequest("POST", {
          inserts: [],
          updates: [
            {
              nodeType: "plausibility_note",
              id: insertedNoteId,
              payload: { status: "IGNORED" },
            },
          ],
          deletes: [],
        }),
      );
      expect(lockedWrite.status).toBe(409);
      expect(await readProjectState(database, projectId)).toEqual(beforeAtomicFailure);

      const copyNodes = [
        {
          nodeType: "plausibility_note",
          id: insertedNoteId,
          setOutdated: true,
          overrides: { status: "IGNORED" },
        },
        {
          nodeType: "plausibility_note_occurrence",
          id: insertedOccurrenceId,
          setOutdated: false,
          overrides: {},
        },
      ];
      const beforeDryRun = await readProjectState(database, projectId);
      const dryRun = await mutateJson(
        `/${projectId}/copy-version`,
        mutationRequest("POST", {
          sourceVersion: 1,
          targetVersion: 2,
          lockToken,
          dryRun: true,
          nodes: copyNodes,
        }),
      );
      expect(dryRun.status).toBe(200);
      expect(parseMutationContract(CopyVersionResponseSchema, dryRun.body)).toEqual({
        dryRun: true,
        copied: 2,
      });
      expect(await readProjectState(database, projectId)).toEqual(beforeDryRun);

      const committedCopy = await mutateJson(
        `/${projectId}/copy-version`,
        mutationRequest("POST", {
          sourceVersion: 1,
          targetVersion: 2,
          lockToken,
          dryRun: false,
          nodes: copyNodes,
        }),
      );
      expect(committedCopy.status).toBe(200);
      expect(parseMutationContract(CopyVersionResponseSchema, committedCopy.body)).toEqual({
        dryRun: false,
        copied: 2,
      });
      state = await readProjectState(database, projectId);
      expect(
        state.notes.find(({ id, projectVersion }) => id === insertedNoteId && projectVersion === 2),
      ).toMatchObject({ status: "IGNORED", isOutdated: true });
      expect(
        state.occurrences.find(
          ({ id, projectVersion }) => id === insertedOccurrenceId && projectVersion === 2,
        ),
      ).toMatchObject({ plausibilityNoteId: insertedNoteId, isOutdated: false });

      const beforeMissingCopy = state;
      await setCoreVersionLock(database, projectId, {
        sourceVersion: 1,
        targetVersion: 3,
        lockToken,
      });
      const missingCopy = await mutateJson(
        `/${projectId}/copy-version`,
        mutationRequest("POST", {
          sourceVersion: 1,
          targetVersion: 3,
          lockToken,
          dryRun: false,
          nodes: [
            {
              nodeType: "plausibility_note",
              id: copyMissingId,
              setOutdated: false,
              overrides: {},
            },
          ],
        }),
      );
      expect(missingCopy.status).toBe(422);
      expect(await readProjectState(database, projectId)).toEqual(beforeMissingCopy);

      await setCoreVersionLock(database, projectId, {
        sourceVersion: 1,
        targetVersion: 2,
        lockToken: `other-${lockToken}`,
      });
      const lockedUndo = await mutateJson(
        `/${projectId}/undo-version`,
        mutationRequest("POST", { targetVersion: 2, lockToken }),
      );
      expect(lockedUndo.status).toBe(409);
      expect(await readProjectState(database, projectId)).toEqual(beforeMissingCopy);

      await setCoreVersionLock(database, projectId, {
        sourceVersion: 1,
        targetVersion: 2,
        lockToken,
      });
      const undo = await mutateJson(
        `/${projectId}/undo-version`,
        mutationRequest("POST", { targetVersion: 2, lockToken }),
      );
      expect(undo.status).toBe(200);
      expect(parseMutationContract(UndoVersionResponseSchema, undo.body)).toEqual({
        deleted: {
          plausibility_note_occurrence: 1,
          plausibility_note: 1,
        },
      });
      state = await readProjectState(database, projectId);
      expect(state.notes.filter(({ projectVersion }) => projectVersion === 2)).toEqual([]);
      expect(state.occurrences.filter(({ projectVersion }) => projectVersion === 2)).toEqual([]);
      expect(
        state.noteHistory.some(
          ({ id, projectVersion }) => id === insertedNoteId && projectVersion === 2,
        ),
      ).toBeTrue();
      expect(
        state.occurrenceHistory.some(
          ({ id, projectVersion }) => id === insertedOccurrenceId && projectVersion === 2,
        ),
      ).toBeTrue();
    } finally {
      await cleanupMutationScenario(database, [projectId]);
    }
    await assertMutationScenarioAbsent(database, [projectId]);
  });
});
