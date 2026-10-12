import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import mutationScenarios from "../../fixtures/mutation-scenarios.json";
import {
  CopyVersionResponseSchema,
  DeadlineMutationResponseSchema,
  InitializationResponseSchema,
  MutationErrorSchema,
  NodeMutationResponseSchema,
  ProjectMutationResponseSchema,
  ProjectTypeMutationResponseSchema,
  TopicMutationResponseSchema,
  UndoVersionResponseSchema,
  parseMutationContract,
} from "../support/mutation-contracts.ts";
import {
  assertMutationScenarioAbsent,
  classifyProjectEntryDate,
  cleanupAuditEntries,
  cleanupMutationScenario,
  copyProjectRootVersion,
  createMutationDatabase,
  insertActiveVersionLock,
  readProjectState,
  readProjectTypeState,
  type MutationDatabase,
} from "../support/mutation-database.ts";
import { AUDIT_HEADERS, mutateJson, mutateRaw, mutationRequest } from "../support/mutation-http.ts";

const describeMutationTests =
  process.env.PLS_MUTATION_BASE_URL === undefined ||
  process.env.PLS_MUTATION_DATABASE_URL === undefined
    ? describe.skip
    : describe;

const createdById = "71000000-0000-4000-8000-000000000010";
const reference = mutationScenarios.reference;

const createProject = async (
  projectTypeId: string,
  suffix: string,
  applicant = false,
  entryDate = "2026-07-17",
) => {
  const body = {
    name: `Mutation project ${suffix}`,
    projectTypeId,
    createdById,
    entryDate,
    internalProjectNumber: `PLS-${suffix}-${crypto.randomUUID()}`,
    state: "Bayern",
  };
  if (applicant) {
    Object.assign(body, {
      salutation: "Frau",
      company: "Example GmbH",
      firstName: "Ada",
      lastName: "Lovelace",
      street: "Teststraße",
      houseNumber: "17",
      plz: "10115",
      location: "Berlin",
      country: "Deutschland",
      email: "test@example.test",
    });
  }
  const response = await mutateJson(
    "/projects",
    mutationRequest(
      "POST",
      body,
      AUDIT_HEADERS,
    ),
  );
  expect(response.status).toBe(201);
  return parseMutationContract(ProjectMutationResponseSchema, response.body);
};

const cleanupOwned = async (
  database: MutationDatabase,
  input: { projectIds?: string[]; projectTypeIds?: string[] },
) => {
  await cleanupMutationScenario(database, input);
  await assertMutationScenarioAbsent(database, input);
};

describeMutationTests("Project Logic HTTP mutation contract", () => {
  let database: MutationDatabase;

  beforeAll(async () => {
    database = createMutationDatabase();
    await database.ready();
  });

  afterAll(async () => {
    await database.close();
  });

  test("freezes bulk project-type create, atomic duplicate rollback, update, history, and delete", async () => {
    const prefix = `Mutation type ${crypto.randomUUID()}`;
    const ownedTypeIds: string[] = [];
    try {
      const createdResponse = await mutateJson(
        "/project-types",
        mutationRequest("POST", [{ name: `${prefix} A` }, { name: `${prefix} B` }]),
      );
      expect(createdResponse.status).toBe(201);
      const created = parseMutationContract(
        ProjectTypeMutationResponseSchema,
        createdResponse.body,
      );
      ownedTypeIds.push(...created.map(({ id }) => id));
      expect(created.map(({ name }) => name)).toEqual([`${prefix} A`, `${prefix} B`]);

      const failed = await mutateJson(
        "/project-types",
        mutationRequest("POST", [{ name: `${prefix} A` }, { name: `${prefix} rolled back` }]),
      );
      expect(failed.status).toBe(409);
      parseMutationContract(MutationErrorSchema, failed.body);
      const listed = await mutateJson("/project-types", mutationRequest("GET"));
      const listedTypes = parseMutationContract(ProjectTypeMutationResponseSchema, listed.body);
      expect(listedTypes.some(({ name }) => name === `${prefix} rolled back`)).toBeFalse();

      const updatedResponse = await mutateJson(
        "/project-types",
        mutationRequest(
          "PATCH",
          created.map(({ id }, index) => ({ id, name: `${prefix} ${index + 1} updated` })),
        ),
      );
      expect(updatedResponse.status).toBe(200);
      const updated = parseMutationContract(
        ProjectTypeMutationResponseSchema,
        updatedResponse.body,
      );
      expect(updated.map(({ name, active }) => ({ name, active }))).toEqual([
        { name: `${prefix} 1 updated`, active: true },
        { name: `${prefix} 2 updated`, active: true },
      ]);
      for (const id of ownedTypeIds) {
        const state = await readProjectTypeState(database, id);
        expect(state.current).toHaveLength(1);
        expect(state.history).toHaveLength(1);
        expect(state.steps).toEqual([]);
      }

      const query = new URLSearchParams();
      for (const id of ownedTypeIds) query.append("ids", id);
      const deleted = await mutateRaw(
        `/project-types?${query.toString()}`,
        mutationRequest("DELETE"),
      );
      expect(deleted).toMatchObject({ status: 204, text: "" });
      for (const id of ownedTypeIds) {
        const state = await readProjectTypeState(database, id);
        expect(state.current).toEqual([]);
        expect(state.history.length).toBeGreaterThanOrEqual(2);
      }
    } finally {
      await cleanupOwned(database, { projectTypeIds: ownedTypeIds });
    }
  });

  test("freezes project aggregate defaults, applicant upsert, status monotonicity, idempotency, history, and audit", async () => {
    const projectIds: string[] = [];
    try {
      const project = await createProject(reference.projectTypeId, "aggregate", true);
      projectIds.push(project.id);
      expect(project).toMatchObject({
        projectTypeId: reference.projectTypeId,
        createdById,
        statusId: reference.inCreationStatusId,
        statusName: "In Erstellung",
        company: "Example GmbH",
        firstName: "Ada",
        state: "Bayern",
        projectVersion: 1,
        latestVersion: 1,
        owners: [],
        members: [],
        auditors: [],
      });

      let state = await readProjectState(database, project.id);
      expect(state.projects).toHaveLength(1);
      expect(state.applicants).toHaveLength(1);
      expect(state.topics.length).toBeGreaterThan(20);
      expect(state.topicNorms.length).toBeGreaterThan(20);
      expect(state.topics.some(({ name }) => name === "Gegenstand des Vorhabens")).toBeTrue();
      expect(
        state.topicNorms.some(
          ({ jurabk, paragraphNr }) => jurabk === "BayWaldG" && paragraphNr === "1",
        ),
      ).toBeTrue();
      expect(
        state.audit.some(
          ({ entityType, changeType }) => entityType === "project" && changeType === "create",
        ),
      ).toBeTrue();
      const projectCreateAudit = state.audit.find(
        ({ entityType, changeType }) => entityType === "project" && changeType === "create",
      );
      expect(projectCreateAudit).toMatchObject({
        actorUserId: AUDIT_HEADERS["X-Actor-User-Id"],
        triggeredByUserId: AUDIT_HEADERS["X-Triggered-By-User-Id"],
        workflowRunId: AUDIT_HEADERS["X-Workflow-Run-Id"],
        workflowType: AUDIT_HEADERS["X-Workflow-Type"],
        requestId: AUDIT_HEADERS["X-Request-Id"],
      });
      expect(projectCreateAudit?.requestStartTime?.toISOString()).toBe("2026-07-17T06:00:00.000Z");

      const updatedResponse = await mutateJson(
        `/projects/${project.id}`,
        mutationRequest(
          "PATCH",
          { name: "Mutation project updated", company: "Updated Example GmbH", phone: "+49-17" },
          AUDIT_HEADERS,
        ),
      );
      expect(updatedResponse.status).toBe(200);
      const updated = parseMutationContract(ProjectMutationResponseSchema, updatedResponse.body);
      expect(updated).toMatchObject({
        id: project.id,
        name: "Mutation project updated",
        company: "Updated Example GmbH",
        phone: "+49-17",
      });

      const statusResponse = await mutateJson(
        `/projects/${project.id}/status`,
        mutationRequest("PATCH", { internalName: "OPEN" }, AUDIT_HEADERS),
      );
      expect(statusResponse.status).toBe(200);
      const open = parseMutationContract(ProjectMutationResponseSchema, statusResponse.body);
      expect(open).toMatchObject({ statusId: reference.openStatusId, statusName: "Offen" });

      state = await readProjectState(database, project.id);
      const historyAfterTransition = state.projectHistory.length;
      const auditAfterTransition = state.audit.length;
      const sameStatus = await mutateJson(
        `/projects/${project.id}/status`,
        mutationRequest("PATCH", { internalName: "OPEN" }, AUDIT_HEADERS),
      );
      expect(sameStatus.status).toBe(200);
      parseMutationContract(ProjectMutationResponseSchema, sameStatus.body);
      state = await readProjectState(database, project.id);
      expect(state.projectHistory).toHaveLength(historyAfterTransition);
      expect(state.audit).toHaveLength(auditAfterTransition);

      const backwards = await mutateJson(
        `/projects/${project.id}/status`,
        mutationRequest("PATCH", { internalName: "IN_CREATION" }, AUDIT_HEADERS),
      );
      expect(backwards.status).toBe(422);
      parseMutationContract(MutationErrorSchema, backwards.body);

      const duplicate = await mutateJson(
        "/projects",
        mutationRequest(
          "POST",
          {
            name: "Duplicate internal number",
            projectTypeId: reference.projectTypeId,
            createdById,
            entryDate: "2026-07-17",
            internalProjectNumber: project.internalProjectNumber,
            state: "Bayern",
          },
          AUDIT_HEADERS,
        ),
      );
      expect(duplicate.status).toBe(409);
      parseMutationContract(MutationErrorSchema, duplicate.body);

      state = await readProjectState(database, project.id);
      expect(state.projectHistory.length).toBeGreaterThanOrEqual(2);
      expect(state.applicantHistory.length).toBeGreaterThanOrEqual(1);
      expect(
        state.audit.map(({ entityType, changeType }) => `${entityType}:${changeType}`),
      ).toEqual(
        expect.arrayContaining([
          "project:create",
          "applicant:create",
          "project:update",
          "applicant:update",
        ]),
      );
    } finally {
      await cleanupOwned(database, { projectIds });
    }
  });

  test("freezes admitted non-finite Project entry-date mutations and sentinel storage", async () => {
    const edges = [
      {
        label: "negative-infinity",
        publicValue: "0001-01-01",
        stored: { negativeInfinity: true, positiveInfinity: false, null: false },
      },
      {
        label: "positive-infinity",
        publicValue: "9999-12-31",
        stored: { negativeInfinity: false, positiveInfinity: true, null: false },
      },
    ] as const;
    const projectIds: string[] = [];

    try {
      for (const edge of edges) {
        const project = await createProject(
          reference.projectTypeId,
          `entry-date-${edge.label}`,
          false,
          edge.publicValue,
        );
        projectIds.push(project.id);
        expect(project).toMatchObject({
          id: project.id,
          entryDate: edge.publicValue,
          projectVersion: 1,
          latestVersion: 1,
        });
        expect(await classifyProjectEntryDate(database, project.id)).toEqual(edge.stored);

        const readResponse = await mutateJson(`/projects/${project.id}`, mutationRequest("GET"));
        expect(readResponse.status).toBe(200);
        const readProject = parseMutationContract(ProjectMutationResponseSchema, readResponse.body);
        expect(readProject).toMatchObject({
          id: project.id,
          entryDate: edge.publicValue,
          projectVersion: 1,
          latestVersion: 1,
        });
      }
    } finally {
      await cleanupOwned(database, { projectIds });
    }
  });

  test("freezes topic uniqueness, parent validation, update, and soft delete", async () => {
    const typeResponse = await mutateJson(
      "/project-types",
      mutationRequest("POST", [{ name: `Mutation topics ${crypto.randomUUID()}` }]),
    );
    expect(typeResponse.status).toBe(201);
    const [projectType] = parseMutationContract(
      ProjectTypeMutationResponseSchema,
      typeResponse.body,
    );
    if (projectType === undefined) throw new Error("Project type create returned no row");
    const project = await createProject(projectType.id, "topics");
    try {
      const rootResponse = await mutateJson(
        "/topics",
        mutationRequest("POST", {
          projectId: project.id,
          name: "Mutation root topic",
          description: "Initial description",
        }, AUDIT_HEADERS),
      );
      expect(rootResponse.status).toBe(201);
      const root = parseMutationContract(TopicMutationResponseSchema, rootResponse.body);
      expect(root).toMatchObject({
        projectId: project.id,
        parentTopicId: null,
        name: "Mutation root topic",
        showInMvp: true,
        showInEwm: true,
        showInBeschluss: true,
        isDeleted: false,
      });

      const duplicate = await mutateJson(
        "/topics",
        mutationRequest("POST", { projectId: project.id, name: root.name }),
      );
      expect(duplicate.status).toBe(409);
      parseMutationContract(MutationErrorSchema, duplicate.body);

      const missingParent = await mutateJson(
        "/topics",
        mutationRequest("POST", {
          projectId: project.id,
          parentTopicId: crypto.randomUUID(),
          name: "Rejected child",
        }),
      );
      expect(missingParent.status).toBe(404);
      parseMutationContract(MutationErrorSchema, missingParent.body);

      const childResponse = await mutateJson(
        "/topics",
        mutationRequest("POST", {
          projectId: project.id,
          parentTopicId: root.id,
          name: "Mutation child topic",
          showInMvp: false,
          showInEwm: true,
          showInBeschluss: false,
        }, AUDIT_HEADERS),
      );
      expect(childResponse.status).toBe(201);
      const child = parseMutationContract(TopicMutationResponseSchema, childResponse.body);

      const updatedResponse = await mutateJson(
        `/topics/${child.id}`,
        mutationRequest("PATCH", {
          name: "Mutation child updated",
          description: "Updated description",
          parentTopicId: root.id,
          showInMvp: true,
        }, AUDIT_HEADERS),
      );
      expect(updatedResponse.status).toBe(200);
      const updated = parseMutationContract(TopicMutationResponseSchema, updatedResponse.body);
      expect(updated).toMatchObject({
        id: child.id,
        name: "Mutation child updated",
        description: "Updated description",
        parentTopicId: root.id,
        showInMvp: true,
      });

      const deletedResponse = await mutateJson(`/topics/${child.id}`, mutationRequest("DELETE", undefined, AUDIT_HEADERS));
      expect(deletedResponse.status).toBe(200);
      const deleted = parseMutationContract(TopicMutationResponseSchema, deletedResponse.body);
      expect(deleted).toMatchObject({ id: child.id, isDeleted: true });

      const state = await readProjectState(database, project.id);
      expect(state.topics).toHaveLength(2);
      expect(state.topicHistory.length).toBeGreaterThanOrEqual(2);
      expect(
        state.audit.filter(({ entityType }) => entityType === "topic").map(
          ({ entityId, changeType, actorUserId }) => ({ entityId, changeType, actorUserId }),
        ),
      ).toEqual([
        { entityId: root.id, changeType: "create", actorUserId: AUDIT_HEADERS["X-Actor-User-Id"] },
        { entityId: child.id, changeType: "create", actorUserId: AUDIT_HEADERS["X-Actor-User-Id"] },
        { entityId: child.id, changeType: "update", actorUserId: AUDIT_HEADERS["X-Actor-User-Id"] },
        { entityId: child.id, changeType: "delete", actorUserId: AUDIT_HEADERS["X-Actor-User-Id"] },
      ]);
    } finally {
      await cleanupOwned(database, {
        projectIds: [project.id],
        projectTypeIds: [projectType.id],
      });
    }
  });

  test("freezes deadline validation, update, audit, versioned delete, and temporal history", async () => {
    const project = await createProject(reference.projectTypeId, "deadlines");
    try {
      const invalid = await mutateJson(
        "/deadlines",
        mutationRequest("POST", {
          projectId: project.id,
          startAt: "2026-08-10",
          endAt: "2026-08-01",
          deadlineType: "Invalid",
        }),
      );
      expect(invalid.status).toBe(422);
      parseMutationContract(MutationErrorSchema, invalid.body);

      const createdResponse = await mutateJson(
        "/deadlines",
        mutationRequest(
          "POST",
          {
            projectId: project.id,
            startAt: "2026-08-01",
            endAt: "2026-08-31",
            deadlineType: "Stellungnahme",
            legalBasis: "§ 17 FStrG",
          },
          AUDIT_HEADERS,
        ),
      );
      expect(createdResponse.status).toBe(201);
      const created = parseMutationContract(DeadlineMutationResponseSchema, createdResponse.body);
      expect(created).toMatchObject({
        projectId: project.id,
        startAt: "2026-08-01",
        endAt: "2026-08-31",
        deadlineType: "Stellungnahme",
        legalBasis: "§ 17 FStrG",
      });

      const updatedResponse = await mutateJson(
        `/deadlines/${created.id}`,
        mutationRequest(
          "PATCH",
          { endAt: "2026-09-15", deadlineType: "Erörterung", legalBasis: null },
          AUDIT_HEADERS,
        ),
      );
      expect(updatedResponse.status).toBe(200);
      const updated = parseMutationContract(DeadlineMutationResponseSchema, updatedResponse.body);
      expect(updated).toMatchObject({
        id: created.id,
        endAt: "2026-09-15",
        deadlineType: "Erörterung",
        legalBasis: null,
      });

      const deletedResponse = await mutateJson(
        `/deadlines/${created.id}`,
        mutationRequest("DELETE", undefined, AUDIT_HEADERS),
      );
      expect(deletedResponse.status).toBe(200);
      parseMutationContract(DeadlineMutationResponseSchema, deletedResponse.body);

      const state = await readProjectState(database, project.id);
      expect(state.deadlines).toMatchObject([{ id: created.id, projectVersion: 1, isDeleted: true }]);
      expect(state.deadlineHistory.length).toBeGreaterThanOrEqual(2);
      expect(
        state.audit
          .filter(({ entityType }) => entityType === "deadline")
          .map(({ changeType }) => changeType),
      ).toEqual(["create", "update", "delete"]);
    } finally {
      await cleanupOwned(database, { projectIds: [project.id] });
    }
  });

  test("freezes mixed node insert/update/delete, rollback, current/history/audit, and explicit version", async () => {
    const project = await createProject(reference.projectTypeId, "nodes");
    const topicId = crypto.randomUUID();
    const deadlineId = crypto.randomUUID();
    const atomicTopicId = crypto.randomUUID();
    try {
      const insertedResponse = await mutateJson(
        `/${project.id}/update?projectVersion=1`,
        mutationRequest(
          "POST",
          {
            inserts: [
              { nodeType: "topic", id: topicId, payload: { name: "Node topic" } },
              {
                nodeType: "deadline",
                id: deadlineId,
                payload: {
                  startAt: "2026-10-01",
                  endAt: "2026-10-31",
                  deadlineType: "Node deadline",
                },
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
      expect(inserted.inserted.map(({ id }) => id).sort()).toEqual([deadlineId, topicId].sort());

      const updatedResponse = await mutateJson(
        `/${project.id}/update?projectVersion=1`,
        mutationRequest(
          "POST",
          {
            inserts: [],
            updates: [
              {
                nodeType: "topic",
                id: topicId,
                payload: { description: "Node topic updated", showInMvp: false },
              },
              {
                nodeType: "deadline",
                id: deadlineId,
                payload: { legalBasis: "§ 1 TestG" },
              },
            ],
            deletes: [],
          },
          AUDIT_HEADERS,
        ),
      );
      expect(updatedResponse.status).toBe(200);
      const updated = parseMutationContract(NodeMutationResponseSchema, updatedResponse.body);
      expect(updated.updated.find(({ id }) => id === topicId)).toMatchObject({
        description: "Node topic updated",
        showInMvp: false,
      });

      const deletedResponse = await mutateJson(
        `/${project.id}/update?projectVersion=1`,
        mutationRequest(
          "POST",
          {
            inserts: [],
            updates: [],
            deletes: [
              { nodeType: "topic", id: topicId },
              { nodeType: "deadline", id: deadlineId },
            ],
          },
          AUDIT_HEADERS,
        ),
      );
      expect(deletedResponse.status).toBe(200);
      const deleted = parseMutationContract(NodeMutationResponseSchema, deletedResponse.body);
      expect(deleted.deleted.map(({ id }) => id).sort()).toEqual([deadlineId, topicId].sort());

      const rolledBack = await mutateJson(
        `/${project.id}/update?projectVersion=1`,
        mutationRequest(
          "POST",
          {
            inserts: [
              { nodeType: "topic", id: atomicTopicId, payload: { name: "Must roll back" } },
              {
                nodeType: "topic_norm",
                id: crypto.randomUUID(),
                payload: { topicId: crypto.randomUUID(), jurabk: "TestG" },
              },
            ],
            updates: [],
            deletes: [],
          },
          AUDIT_HEADERS,
        ),
      );
      expect(rolledBack.status).toBeGreaterThanOrEqual(400);
      parseMutationContract(MutationErrorSchema, rolledBack.body);

      const state = await readProjectState(database, project.id);
      expect(state.topics.find(({ id }) => id === topicId)).toMatchObject({ isDeleted: true });
      expect(state.deadlines.find(({ id }) => id === deadlineId)).toMatchObject({
        isDeleted: true,
      });
      expect(state.topics.some(({ id }) => id === atomicTopicId)).toBeFalse();
      expect(state.topicHistory.some(({ id }) => id === atomicTopicId)).toBeFalse();
      expect(state.audit.some(({ entityId }) => entityId === atomicTopicId)).toBeFalse();
      expect(state.topicHistory.length).toBeGreaterThanOrEqual(2);
      expect(state.deadlineHistory.length).toBeGreaterThanOrEqual(2);
      expect(
        state.audit
          .filter(({ entityId }) => entityId === topicId || entityId === deadlineId)
          .map(({ changeType }) => changeType),
      ).toEqual(["create", "create", "update", "update", "delete", "delete"]);
    } finally {
      await cleanupOwned(database, { projectIds: [project.id] });
    }
  });

  test("freezes meaningful locked copy dry-run/commit, undo, and invalid lock behavior", async () => {
    const project = await createProject(reference.projectTypeId, "copy-version");
    const sourceTopicId = crypto.randomUUID();
    const lockToken = `project-logic-copy-${crypto.randomUUID()}`;
    try {
      const sourceResponse = await mutateJson(
        `/${project.id}/update?projectVersion=1`,
        mutationRequest(
          "POST",
          {
            inserts: [
              {
                nodeType: "topic",
                id: sourceTopicId,
                payload: {
                  name: "Copy source topic",
                  description: "Source description",
                  showInMvp: true,
                  showInEwm: false,
                  showInBeschluss: true,
                },
              },
            ],
            updates: [],
            deletes: [],
          },
          AUDIT_HEADERS,
        ),
      );
      expect(sourceResponse.status).toBe(200);
      parseMutationContract(NodeMutationResponseSchema, sourceResponse.body);
      await insertActiveVersionLock(database, {
        projectId: project.id,
        sourceVersion: 1,
        targetVersion: 2,
        lockToken,
      });

      const before = await readProjectState(database, project.id);
      const sourceBefore = before.topics.find(
        ({ id, projectVersion }) => id === sourceTopicId && projectVersion === 1,
      );
      expect(sourceBefore).toMatchObject({
        name: "Copy source topic",
        description: "Source description",
        showInMvp: true,
        showInEwm: false,
        showInBeschluss: true,
        isOutdated: false,
      });
      expect(before.topics.some(({ projectVersion }) => projectVersion === 2)).toBeFalse();
      expect(before.topicHistory.some(({ projectVersion }) => projectVersion === 2)).toBeFalse();

      const blockedWrite = await mutateJson(
        `/${project.id}/update?projectVersion=1`,
        mutationRequest("POST", { inserts: [], updates: [], deletes: [] }, AUDIT_HEADERS),
      );
      expect(blockedWrite.status).toBe(409);
      parseMutationContract(MutationErrorSchema, blockedWrite.body);

      const payload = {
        sourceVersion: 1,
        targetVersion: 2,
        lockToken: lockToken,
        nodes: [
          {
            nodeType: "topic",
            id: sourceTopicId,
            setOutdated: true,
            overrides: { description: "Copied target description", showInMvp: false },
          },
        ],
      };
      const dryRunResponse = await mutateJson(
        `/${project.id}/copy-version`,
        mutationRequest("POST", { ...payload, dryRun: true }),
      );
      expect(dryRunResponse.status).toBe(200);
      expect(parseMutationContract(CopyVersionResponseSchema, dryRunResponse.body)).toEqual({
        dryRun: true,
        copied: 1,
      });
      const afterDryRun = await readProjectState(database, project.id);
      expect(afterDryRun.topics.some(({ projectVersion }) => projectVersion === 2)).toBeFalse();
      expect(
        afterDryRun.topicHistory.some(({ projectVersion }) => projectVersion === 2),
      ).toBeFalse();
      expect(
        afterDryRun.topics.find(
          ({ id, projectVersion }) => id === sourceTopicId && projectVersion === 1,
        ),
      ).toEqual(sourceBefore);

      const invalidLock = await mutateJson(
        `/${project.id}/copy-version`,
        mutationRequest("POST", { ...payload, lockToken: "wrong-lock", dryRun: true }),
      );
      expect(invalidLock.status).toBe(409);
      parseMutationContract(MutationErrorSchema, invalidLock.body);

      await copyProjectRootVersion(database, {
        projectId: project.id,
        sourceVersion: 1,
        targetVersion: 2,
      });

      const committedResponse = await mutateJson(
        `/${project.id}/copy-version`,
        mutationRequest("POST", { ...payload, dryRun: false }),
      );
      expect(committedResponse.status).toBe(200);
      expect(parseMutationContract(CopyVersionResponseSchema, committedResponse.body)).toEqual({
        dryRun: false,
        copied: 1,
      });
      const afterCommit = await readProjectState(database, project.id);
      expect(
        afterCommit.topics.find(
          ({ id, projectVersion }) => id === sourceTopicId && projectVersion === 2,
        ),
      ).toMatchObject({
        name: "Copy source topic",
        description: "Copied target description",
        showInMvp: false,
        showInEwm: false,
        showInBeschluss: true,
        isDeleted: false,
        isOutdated: true,
      });
      expect(
        afterCommit.topics.find(
          ({ id, projectVersion }) => id === sourceTopicId && projectVersion === 1,
        ),
      ).toEqual(sourceBefore);

      const undoResponse = await mutateJson(
        `/${project.id}/undo-version`,
        mutationRequest("POST", { targetVersion: 2, lockToken: lockToken }),
      );
      expect(undoResponse.status).toBe(200);
      const undone = parseMutationContract(UndoVersionResponseSchema, undoResponse.body);
      expect(undone.deleted).toMatchObject({ topic: 1 });

      const afterUndo = await readProjectState(database, project.id);
      expect(afterUndo.topics.some(({ projectVersion }) => projectVersion === 2)).toBeFalse();
      const targetTopicHistory = afterUndo.topicHistory.filter(
        ({ id, projectVersion }) => id === sourceTopicId && projectVersion === 2,
      );
      expect(targetTopicHistory).toHaveLength(1);
      expect(targetTopicHistory[0]).toMatchObject({
        id: sourceTopicId,
        projectId: project.id,
        projectVersion: 2,
        name: "Copy source topic",
        description: "Copied target description",
        showInMvp: false,
        showInEwm: false,
        showInBeschluss: true,
        isDeleted: false,
        isOutdated: true,
      });
      expect(
        afterUndo.topics.find(
          ({ id, projectVersion }) => id === sourceTopicId && projectVersion === 1,
        ),
      ).toEqual(sourceBefore);
    } finally {
      await cleanupOwned(database, { projectIds: [project.id] });
    }
  });

  test("dispatches initialization for the retained project and records its action", async () => {
    const scenario = mutationScenarios.initialization.project;
    const before = await readProjectState(database, scenario.projectId);
    let createdAuditIds: string[] = [];
    try {
      const startedResponse = await mutateJson(
        `/projects/${scenario.projectId}/initialize`,
        mutationRequest("POST", undefined, AUDIT_HEADERS),
      );
      expect(startedResponse.status).toBe(200);
      const started = parseMutationContract(InitializationResponseSchema, startedResponse.body);
      expect(started).toEqual({
        message: `Project initialization workflow started for project '${scenario.projectId}'.`,
        workflowStatus: "RUNNING",
      });

      const after = await readProjectState(database, scenario.projectId);
      const beforeIds = new Set(before.audit.map(({ id }) => id));
      createdAuditIds = after.audit.filter(({ id }) => !beforeIds.has(id)).map(({ id }) => id);
      expect(createdAuditIds).toHaveLength(1);
      expect(after.audit.find(({ id }) => createdAuditIds.includes(id))).toMatchObject({
        entityType: "project",
        changeType: "action",
        actionType: "project_initialization",
      });
    } finally {
      await cleanupAuditEntries(database, createdAuditIds);
    }
  });

  test("dispatches project deletion without applying workflow side effects", async () => {
    const scenario = mutationScenarios.initialization.project;
    const before = await readProjectState(database, scenario.projectId);
    const response = await mutateRaw(
      `/projects/${scenario.projectId}`,
      mutationRequest("DELETE", undefined, AUDIT_HEADERS),
    );
    expect(response).toMatchObject({ status: 204, text: "" });
    const after = await readProjectState(database, scenario.projectId);
    expect(after).toEqual(before);
  });
});
