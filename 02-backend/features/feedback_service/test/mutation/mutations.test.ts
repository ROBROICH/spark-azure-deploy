import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import {
  assertProjectAbsent,
  cleanupMutationScenario,
  countProjectVersionRows,
  createMutationDatabase,
  deleteCoreProjectVersion,
  readProjectState,
  seedCoreProjectVersion,
  setCoreVersionLock,
  type MutationDatabase,
} from "../support/mutation-database.ts";
import {
  CopyVersionResponseSchema,
  DetailErrorSchema,
  NodeMutationResponseSchema,
  UndoVersionResponseSchema,
  ValidationErrorSchema,
  parseMutationContract,
} from "../support/mutation-contracts.ts";
import { mutateJson, mutationRequest } from "../support/mutation-http.ts";

const describeMutationTests =
  process.env.FEEDBACK_MUTATION_BASE_URL === undefined ? describe.skip : describe;

function feedbackInsert(
  id: string | undefined,
  options: {
    frontendParentIds?: string[];
    rating: "positive" | "negative";
    reason: string | null;
    text: string | null;
    userId: string;
  },
) {
  return {
    nodeType: "feedback",
    id,
    payload: {
      rating: options.rating,
      reason: options.reason,
      text: options.text,
      userId: options.userId,
      frontendParentIds: options.frontendParentIds ?? [],
      isOutdated: false,
      updateType: "manual",
    },
  };
}

describeMutationTests("Feedback HTTP mutation contract", () => {
  let database: MutationDatabase;

  beforeAll(async () => {
    database = createMutationDatabase();
    await database.ready();
  });

  afterAll(async () => {
    await database.close();
  });

  test("freezes empty and mixed insert, patch, soft-delete, generated-id, and history behavior", async () => {
    const projectId = crypto.randomUUID();
    const suppliedId = crypto.randomUUID();
    const deletedId = crypto.randomUUID();
    const firstUserId = crypto.randomUUID();
    const secondUserId = crypto.randomUUID();
    const generatedUserId = crypto.randomUUID();
    await assertProjectAbsent(database, projectId);
    await seedCoreProjectVersion(database, projectId, 1);

    try {
      const emptyResponse = await mutateJson(
        `/${projectId}/update?projectVersion=1`,
        mutationRequest("POST", { inserts: [], updates: [], deletes: [] }),
      );
      expect(emptyResponse.status).toBe(200);
      expect(parseMutationContract(NodeMutationResponseSchema, emptyResponse.body)).toEqual({
        inserted: [],
        updated: [],
        deleted: [],
      });

      const seedResponse = await mutateJson(
        `/${projectId}/update?projectVersion=1`,
        mutationRequest("POST", {
          inserts: [
            feedbackInsert(suppliedId, {
              rating: "positive",
              reason: "Useful context",
              text: "Keep this explanation.",
              userId: firstUserId,
            }),
            feedbackInsert(deletedId, {
              rating: "negative",
              reason: null,
              text: null,
              userId: secondUserId,
            }),
          ],
          updates: [],
          deletes: [],
        }),
      );
      expect(seedResponse.status).toBe(200);
      const seeded = parseMutationContract(NodeMutationResponseSchema, seedResponse.body);
      expect(seeded.inserted.map(({ id, rating, userId }) => ({ id, rating, userId }))).toEqual([
        { id: suppliedId, rating: "positive", userId: firstUserId },
        { id: deletedId, rating: "negative", userId: secondUserId },
      ]);

      const emptyPatchResponse = await mutateJson(
        `/${projectId}/update?projectVersion=1`,
        mutationRequest("POST", {
          inserts: [],
          updates: [{ nodeType: "feedback", id: suppliedId, payload: {} }],
          deletes: [],
        }),
      );
      expect(emptyPatchResponse.status).toBe(200);
      expect(parseMutationContract(NodeMutationResponseSchema, emptyPatchResponse.body)).toEqual({
        inserted: [],
        updated: [],
        deleted: [],
      });

      const mixedResponse = await mutateJson(
        `/${projectId}/update?projectVersion=1`,
        mutationRequest("POST", {
          inserts: [
            feedbackInsert(undefined, {
              rating: "negative",
              reason: "Generated identity",
              text: null,
              userId: generatedUserId,
            }),
          ],
          updates: [
            {
              nodeType: "feedback",
              id: suppliedId,
              payload: {
                rating: "negative",
                reason: null,
                text: "The explanation was revised.",
                frontendParentIds: ["frontend:review"],
                updateType: "automated",
              },
            },
          ],
          deletes: [{ nodeType: "feedback", id: deletedId }],
        }),
      );
      expect(mixedResponse.status).toBe(200);
      const mixed = parseMutationContract(NodeMutationResponseSchema, mixedResponse.body);
      expect(mixed.inserted).toHaveLength(1);
      const generatedId = mixed.inserted[0]?.id;
      expect(generatedId).toMatch(/^[0-9a-f-]{36}$/);
      expect(generatedId).not.toBe(suppliedId);
      expect(mixed.updated[0]).toMatchObject({
        id: suppliedId,
        rating: "negative",
        reason: null,
        text: "The explanation was revised.",
        userId: firstUserId,
        frontendParentIds: ["frontend:review"],
        updateType: "automated",
      });
      expect(mixed.deleted).toEqual([{ nodeType: "feedback", id: deletedId }]);

      const state = await readProjectState(database, projectId);
      expect(state.current).toHaveLength(3);
      expect(state.current.find(({ id }) => id === suppliedId)).toMatchObject({
        rating: "negative",
        reason: null,
        text: "The explanation was revised.",
        userId: firstUserId,
        isDeleted: false,
        updateType: "automated",
      });
      expect(state.current.find(({ id }) => id === deletedId)).toMatchObject({
        rating: "negative",
        userId: secondUserId,
        isDeleted: true,
      });
      expect(state.current.find(({ id }) => id === generatedId)).toMatchObject({
        rating: "negative",
        reason: "Generated identity",
        text: null,
        userId: generatedUserId,
        isDeleted: false,
      });
      expect(state.history).toHaveLength(2);
      expect(state.history.find(({ id }) => id === suppliedId)).toMatchObject({
        rating: "positive",
        reason: "Useful context",
        text: "Keep this explanation.",
        userId: firstUserId,
        isDeleted: false,
      });
      expect(state.history.find(({ id }) => id === deletedId)).toMatchObject({
        isDeleted: false,
      });
    } finally {
      await cleanupMutationScenario(database, projectId);
    }
    await assertProjectAbsent(database, projectId);
  });

  test("freezes field bounds, action conflicts, locks, and atomic rollback", async () => {
    const projectId = crypto.randomUUID();
    const existingId = crypto.randomUUID();
    const rolledBackId = crypto.randomUUID();
    const missingId = crypto.randomUUID();
    const userId = crypto.randomUUID();
    await assertProjectAbsent(database, projectId);
    await seedCoreProjectVersion(database, projectId, 1);

    try {
      const seed = await mutateJson(
        `/${projectId}/update?projectVersion=1`,
        mutationRequest("POST", {
          inserts: [
            feedbackInsert(existingId, {
              rating: "positive",
              reason: "Original",
              text: "Must remain unchanged.",
              userId,
            }),
          ],
          updates: [],
          deletes: [],
        }),
      );
      expect(seed.status).toBe(200);

      const invalid = await mutateJson(
        `/${projectId}/update?projectVersion=1`,
        mutationRequest("POST", {
          inserts: [
            {
              nodeType: "feedback",
              payload: {
                rating: "neutral",
                reason: "r".repeat(31),
                text: "t".repeat(5_001),
                userId: userId,
              },
            },
          ],
          updates: [],
          deletes: [],
        }),
      );
      expect(invalid.status).toBe(422);
      const invalidBody = parseMutationContract(ValidationErrorSchema, invalid.body);
      const invalidLocations = invalidBody.detail.map(({ loc }) => loc.join("/"));
      expect(invalidLocations.some((location) => location.endsWith("payload/rating"))).toBeTrue();
      expect(invalidLocations.some((location) => location.endsWith("payload/reason"))).toBeTrue();
      expect(invalidLocations.some((location) => location.endsWith("payload/text"))).toBeTrue();

      const conflict = await mutateJson(
        `/${projectId}/update?projectVersion=1`,
        mutationRequest("POST", {
          inserts: [],
          updates: [
            {
              nodeType: "feedback",
              id: existingId,
              payload: { text: "Must not persist" },
            },
          ],
          deletes: [{ nodeType: "feedback", id: existingId }],
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
            feedbackInsert(rolledBackId, {
              rating: "negative",
              reason: null,
              text: "Must roll back.",
              userId,
            }),
          ],
          updates: [
            {
              nodeType: "feedback",
              id: missingId,
              payload: { text: "Missing" },
            },
          ],
          deletes: [],
        }),
      );
      expect(rollback.status).toBe(404);
      expect(parseMutationContract(DetailErrorSchema, rollback.body).detail).toContain(
        "Update batch affected fewer rows than expected",
      );

      await setCoreVersionLock(database, projectId, {
        sourceVersion: 1,
        targetVersion: 2,
        lockToken: "write-lock",
      });
      const locked = await mutateJson(
        `/${projectId}/update?projectVersion=1`,
        mutationRequest("POST", {
          inserts: [],
          updates: [
            {
              nodeType: "feedback",
              id: existingId,
              payload: { rating: "negative" },
            },
          ],
          deletes: [],
        }),
      );
      expect(locked.status).toBe(409);

      const state = await readProjectState(database, projectId);
      expect(state.current).toHaveLength(1);
      expect(state.current[0]).toMatchObject({
        id: existingId,
        rating: "positive",
        reason: "Original",
        text: "Must remain unchanged.",
        isDeleted: false,
      });
      expect(state.current.map(({ id }) => id)).not.toContain(rolledBackId);
      expect(state.history).toEqual([]);
    } finally {
      await cleanupMutationScenario(database, projectId);
    }
    await assertProjectAbsent(database, projectId);
  });

  test("freezes selected version copy, dry-run, preconditions, and failed-version undo", async () => {
    const projectId = crypto.randomUUID();
    const selectedId = crypto.randomUUID();
    const unselectedId = crypto.randomUUID();
    const missingId = crypto.randomUUID();
    const userId = crypto.randomUUID();
    await assertProjectAbsent(database, projectId);
    await seedCoreProjectVersion(database, projectId, 1);

    const selectedDirective = {
      nodeType: "feedback",
      id: selectedId,
      setOutdated: true,
      overrides: { reason: "Copied selection", text: "Copied into the failed version." },
    };
    const bothDirectives = [selectedDirective, { nodeType: "feedback", id: unselectedId }];

    try {
      const seed = await mutateJson(
        `/${projectId}/update?projectVersion=1`,
        mutationRequest("POST", {
          inserts: [
            feedbackInsert(selectedId, {
              frontendParentIds: ["frontend:source-parent"],
              rating: "positive",
              reason: "Source selected",
              text: "Selected source text.",
              userId,
            }),
            feedbackInsert(unselectedId, {
              rating: "negative",
              reason: "Source unselected",
              text: null,
              userId,
            }),
          ],
          updates: [],
          deletes: [],
        }),
      );
      expect(seed.status).toBe(200);

      await setCoreVersionLock(database, projectId, {
        sourceVersion: 1,
        targetVersion: 2,
        lockToken: "copy-lock",
      });
      const dryRun = await mutateJson(
        `/${projectId}/copy-version`,
        mutationRequest("POST", {
          sourceVersion: 1,
          targetVersion: 2,
          lockToken: "copy-lock",
          dryRun: true,
          nodes: [selectedDirective],
        }),
      );
      expect(dryRun.status).toBe(200);
      expect(parseMutationContract(CopyVersionResponseSchema, dryRun.body)).toEqual({
        dryRun: true,
        copied: 1,
      });
      expect(await countProjectVersionRows(database, projectId, 2)).toBe(0);

      await setCoreVersionLock(database, projectId, {
        sourceVersion: 1,
        targetVersion: 1,
        lockToken: "invalid-order",
      });
      const invalidOrder = await mutateJson(
        `/${projectId}/copy-version`,
        mutationRequest("POST", {
          sourceVersion: 1,
          targetVersion: 1,
          lockToken: "invalid-order",
          dryRun: false,
          nodes: [selectedDirective],
        }),
      );
      expect(invalidOrder.status).toBe(422);
      expect(parseMutationContract(DetailErrorSchema, invalidOrder.body).detail).toBe(
        "targetVersion must be greater than sourceVersion",
      );

      await setCoreVersionLock(database, projectId, {
        sourceVersion: 1,
        targetVersion: 2,
        lockToken: "missing-source",
      });
      const missingSource = await mutateJson(
        `/${projectId}/copy-version`,
        mutationRequest("POST", {
          sourceVersion: 1,
          targetVersion: 2,
          lockToken: "missing-source",
          dryRun: false,
          nodes: [{ nodeType: "feedback", id: missingId }],
        }),
      );
      expect(missingSource.status).toBe(422);
      expect(parseMutationContract(DetailErrorSchema, missingSource.body).detail).toContain(
        "missing source nodes",
      );

      await setCoreVersionLock(database, projectId, {
        sourceVersion: 1,
        targetVersion: 2,
        lockToken: "accepted-copy-lock",
      });
      const rejectedCopy = await mutateJson(
        `/${projectId}/copy-version`,
        mutationRequest("POST", {
          sourceVersion: 1,
          targetVersion: 2,
          lockToken: "rejected-lock",
          dryRun: false,
          nodes: [selectedDirective],
        }),
      );
      expect(rejectedCopy.status).toBe(409);

      await setCoreVersionLock(database, projectId, {
        sourceVersion: 1,
        targetVersion: 2,
        lockToken: "copy-lock",
      });
      const committed = await mutateJson(
        `/${projectId}/copy-version`,
        mutationRequest("POST", {
          sourceVersion: 1,
          targetVersion: 2,
          lockToken: "copy-lock",
          dryRun: false,
          nodes: [selectedDirective],
        }),
      );
      expect(committed.status).toBe(200);
      expect(parseMutationContract(CopyVersionResponseSchema, committed.body)).toEqual({
        dryRun: false,
        copied: 1,
      });
      let state = await readProjectState(database, projectId);
      expect(state.current).toHaveLength(3);
      expect(
        state.current.find(({ id, projectVersion }) => id === selectedId && projectVersion === 2),
      ).toMatchObject({
        id: selectedId,
        projectId,
        projectVersion: 2,
        rating: "positive",
        reason: "Copied selection",
        text: "Copied into the failed version.",
        userId,
        frontendParentIds: ["frontend:source-parent"],
        updateType: "manual",
        isDeleted: false,
        isOutdated: true,
      });
      expect(
        state.current.find(({ id, projectVersion }) => id === unselectedId && projectVersion === 2),
      ).toBeUndefined();
      expect(state.history).toEqual([]);

      const historyBeforeRepeat = state.history;
      const repeatedCopy = await mutateJson(
        `/${projectId}/copy-version`,
        mutationRequest("POST", {
          sourceVersion: 1,
          targetVersion: 2,
          lockToken: "copy-lock",
          dryRun: false,
          nodes: [selectedDirective],
        }),
      );
      expect(repeatedCopy.status).toBe(200);
      expect(parseMutationContract(CopyVersionResponseSchema, repeatedCopy.body)).toEqual({
        dryRun: false,
        copied: 1,
      });
      expect(await countProjectVersionRows(database, projectId, 1)).toBe(2);
      expect(await countProjectVersionRows(database, projectId, 2)).toBe(1);
      state = await readProjectState(database, projectId);
      expect(
        state.current.filter(({ id, projectVersion }) => id === selectedId && projectVersion === 2),
      ).toHaveLength(1);
      expect(
        state.current.find(({ id, projectVersion }) => id === selectedId && projectVersion === 2),
      ).toMatchObject({
        id: selectedId,
        projectId,
        projectVersion: 2,
        rating: "positive",
        reason: "Copied selection",
        text: "Copied into the failed version.",
        userId,
        frontendParentIds: ["frontend:source-parent"],
        updateType: "manual",
        isDeleted: false,
        isOutdated: true,
      });
      expect(state.history).toEqual(historyBeforeRepeat);

      const occupiedTarget = await mutateJson(
        `/${projectId}/copy-version`,
        mutationRequest("POST", {
          sourceVersion: 1,
          targetVersion: 2,
          lockToken: "copy-lock",
          dryRun: false,
          nodes: bothDirectives,
        }),
      );
      expect(occupiedTarget.status).toBe(409);
      expect(parseMutationContract(DetailErrorSchema, occupiedTarget.body).detail).toContain(
        "target rows already exist",
      );

      await seedCoreProjectVersion(database, projectId, 2);
      await setCoreVersionLock(database, projectId, {
        sourceVersion: 2,
        targetVersion: 2,
        lockToken: "undo-current",
      });
      const currentUndo = await mutateJson(
        `/${projectId}/undo-version`,
        mutationRequest("POST", { targetVersion: 2, lockToken: "undo-current" }),
      );
      expect(currentUndo.status).toBe(409);
      expect(parseMutationContract(DetailErrorSchema, currentUndo.body).detail).toBe(
        "undo-version requires latest version to be lower than targetVersion",
      );

      await deleteCoreProjectVersion(database, projectId, 2);
      await setCoreVersionLock(database, projectId, {
        sourceVersion: 1,
        targetVersion: 2,
        lockToken: "accepted-undo-lock",
      });
      const rejectedUndo = await mutateJson(
        `/${projectId}/undo-version`,
        mutationRequest("POST", { targetVersion: 2, lockToken: "undo-rejected" }),
      );
      expect(rejectedUndo.status).toBe(409);
      expect(await countProjectVersionRows(database, projectId, 2)).toBe(1);

      await setCoreVersionLock(database, projectId, {
        sourceVersion: 1,
        targetVersion: 2,
        lockToken: "undo-lock",
      });
      const undo = await mutateJson(
        `/${projectId}/undo-version`,
        mutationRequest("POST", { targetVersion: 2, lockToken: "undo-lock" }),
      );
      expect(undo.status).toBe(200);
      expect(parseMutationContract(UndoVersionResponseSchema, undo.body)).toEqual({
        deleted: { feedback: 1 },
      });
      expect(await countProjectVersionRows(database, projectId, 1)).toBe(2);
      expect(await countProjectVersionRows(database, projectId, 2)).toBe(0);
      state = await readProjectState(database, projectId);
      expect(state.history.filter(({ projectVersion }) => projectVersion === 2)).toHaveLength(1);

      const repeatedUndo = await mutateJson(
        `/${projectId}/undo-version`,
        mutationRequest("POST", { targetVersion: 2, lockToken: "undo-lock" }),
      );
      expect(repeatedUndo.status).toBe(200);
      expect(parseMutationContract(UndoVersionResponseSchema, repeatedUndo.body)).toEqual({
        deleted: { feedback: 0 },
      });
    } finally {
      await cleanupMutationScenario(database, projectId);
    }
    await assertProjectAbsent(database, projectId);
  });
});
