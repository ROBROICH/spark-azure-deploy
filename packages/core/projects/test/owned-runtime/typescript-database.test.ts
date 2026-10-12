import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { SQL } from "bun";
import { drizzle, type BunSQLDatabase } from "drizzle-orm/bun-sql";

import { withAuditContext } from "@spark-workflow/audit-client";

import { projectLogicSchema } from "../../src/db/schema.ts";
import type { ProjectLogicDatabase } from "../../src/db.ts";
import { DrizzleProjectLogicActivityRepository } from "../../src/temporal/activity-repository.ts";
import {
  ProjectMutationResponseSchema,
  parseMutationContract,
} from "../support/mutation-contracts.ts";
import {
  assertMutationScenarioAbsent,
  cleanupMutationScenario,
  createMutationDatabase,
  readProjectState,
  type MutationDatabase,
} from "../support/mutation-database.ts";
import { AUDIT_HEADERS, mutateJson, mutationRequest } from "../support/mutation-http.ts";
import { testScope } from "../support/scopes.ts";

const databaseUrl = process.env.PLS_MUTATION_DATABASE_URL?.trim();
const serviceUrl = process.env.PLS_MUTATION_BASE_URL?.trim();
const describeDatabaseTests = databaseUrl && serviceUrl ? describe : describe.skip;

describeDatabaseTests("Project Logic TypeScript database activities", () => {
  let postgres: SQL;
  let activityDatabase: BunSQLDatabase<typeof projectLogicSchema>;
  let observer: MutationDatabase;
  const projectIds: string[] = [];

  beforeAll(async () => {
    postgres = new SQL(databaseUrl!, { max: 1, prepare: false });
    activityDatabase = drizzle({ client: postgres, schema: projectLogicSchema });
    observer = createMutationDatabase();
    await observer.ready();
  });

  afterAll(async () => {
    if (projectIds.length > 0) {
      await cleanupMutationScenario(observer, { projectIds });
      await assertMutationScenarioAbsent(observer, { projectIds });
    }
    await Promise.all([postgres.close({ timeout: 5 }), observer.close()]);
  });

  test("proves lock, root copy/idempotence/undo, attributed deletion, and cleanup", async () => {
    const internalProjectNumber = `PLS-ts-runtime-${crypto.randomUUID()}`;
    const response = await mutateJson(
      "/projects",
      mutationRequest(
        "POST",
        {
          name: "TypeScript owned database activities",
          projectTypeId: "00000000-0000-0000-0000-000000000000",
          createdById: "71000000-0000-4000-8000-000000000010",
          entryDate: "2026-07-17",
          internalProjectNumber,
          state: "Berlin",
          company: "TypeScript runtime applicant",
        },
        AUDIT_HEADERS,
      ),
    );
    expect(response.status).toBe(201);
    const projectId = parseMutationContract(ProjectMutationResponseSchema, response.body).id;
    projectIds.push(projectId);

    const repository = new DrizzleProjectLogicActivityRepository(
      testScope<ProjectLogicDatabase>(activityDatabase),
    );
    const lock = await repository.acquireLock(projectId, 1, 2, null, crypto.randomUUID());
    expect(lock).toMatch(/^[0-9a-f]{32}$/);
    await expect(repository.copyRoot(projectId, 1, 2, "wrong-token", true)).rejects.toThrow(
      "Project version lock is not active or does not match the requested version",
    );
    expect(await repository.copyRoot(projectId, 1, 2, lock, true)).toEqual({ copied: 2 });
    expect(await repository.copyRoot(projectId, 1, 2, lock, false)).toEqual({ copied: 2 });
    expect(await repository.copyRoot(projectId, 1, 2, lock, false)).toEqual({ copied: 0 });

    await expect(repository.undoRoot(projectId, 2, "wrong-token")).rejects.toThrow(
      "Project version lock is not active or does not match the requested version",
    );
    expect(await repository.undoRoot(projectId, 2, lock)).toEqual({ project: 1, applicant: 1 });
    expect(await repository.undoRoot(projectId, 2, lock)).toEqual({ project: 0, applicant: 0 });
    await repository.releaseLock(projectId, lock, null);
    await repository.deleteProject(
      projectId,
      1,
      {
        actorUserId: AUDIT_HEADERS["X-Actor-User-Id"],
        triggeredByUserId: AUDIT_HEADERS["X-Triggered-By-User-Id"],
        workflowType: AUDIT_HEADERS["X-Workflow-Type"],
      },
      "typescript-database-run-4369",
    );

    const state = await readProjectState(observer, projectId);
    expect(state.projects).toHaveLength(1);
    expect(state.projects[0]?.isDeleted).toBeTrue();
    expect(state.applicants).toHaveLength(1);
    expect(state.projectHistory.some(({ projectVersion }) => projectVersion === 2)).toBeTrue();
    expect(state.applicantHistory.some(({ projectVersion }) => projectVersion === 2)).toBeTrue();
    expect(state.locks).toHaveLength(1);
    expect(state.locks[0]).toMatchObject({ status: "RELEASED", error: null });
    expect(state.audit.find(({ changeType }) => changeType === "delete")).toMatchObject({
      actorUserId: AUDIT_HEADERS["X-Actor-User-Id"],
      triggeredByUserId: AUDIT_HEADERS["X-Triggered-By-User-Id"],
      workflowRunId: "typescript-database-run-4369",
      workflowType: AUDIT_HEADERS["X-Workflow-Type"],
    });

    const recreatedResponse = await mutateJson(
      "/projects",
      mutationRequest(
        "POST",
        {
          name: "Duplicate deleted project",
          projectTypeId: "00000000-0000-0000-0000-000000000000",
          createdById: "71000000-0000-4000-8000-000000000010",
          entryDate: "2026-07-17",
          internalProjectNumber,
          state: "Berlin",
        },
        AUDIT_HEADERS,
      ),
    );
    expect(recreatedResponse.status).toBe(201);
    const recreated = parseMutationContract(ProjectMutationResponseSchema, recreatedResponse.body);
    projectIds.push(recreated.id);
    expect(recreated.internalProjectNumber).toBe(internalProjectNumber);
  });

  test("isolates null and partially-null deletion actors from ambient context", async () => {
    const createProject = async (suffix: string): Promise<string> => {
      const response = await mutateJson(
        "/projects",
        mutationRequest(
          "POST",
          {
            name: `TypeScript deletion audit ${suffix}`,
            projectTypeId: "00000000-0000-0000-0000-000000000000",
            createdById: "71000000-0000-4000-8000-000000000010",
            entryDate: "2026-07-17",
            internalProjectNumber: `PLS-ts-delete-${suffix}-${crypto.randomUUID()}`,
            state: "Berlin",
          },
          AUDIT_HEADERS,
        ),
      );
      expect(response.status).toBe(201);
      const id = parseMutationContract(ProjectMutationResponseSchema, response.body).id;
      projectIds.push(id);
      return id;
    };

    const nullActorProjectId = await createProject("null");
    const partialActorProjectId = await createProject("partial");
    const repository = new DrizzleProjectLogicActivityRepository(
      testScope<ProjectLogicDatabase>(activityDatabase),
    );
    const partialActorId = "72000000-0000-4000-8000-000000000099";

    await withAuditContext(
      {
        actorUserId: "81000000-0000-4000-8000-000000000001",
        triggeredByUserId: "81000000-0000-4000-8000-000000000002",
        workflowRunId: "ambient-run",
        workflowType: "AmbientWorkflow",
        requestStartTime: "2026-07-17T08:00:00Z",
        requestId: "81000000-0000-4000-8000-000000000003",
      },
      async () => {
        await repository.deleteProject(nullActorProjectId, 1, null, "typescript-null-run-4369");
        await repository.deleteProject(nullActorProjectId, 1, null, "typescript-repeat-run-4369");
        await repository.deleteProject(
          partialActorProjectId,
          1,
          {
            actorUserId: partialActorId,
            triggeredByUserId: null,
            workflowType: null,
          },
          "typescript-partial-run-4369",
        );
      },
    );

    const nullActorState = await readProjectState(observer, nullActorProjectId);
    const nullActorDeletes = nullActorState.audit.filter(
      ({ changeType }) => changeType === "delete",
    );
    expect(nullActorDeletes).toHaveLength(1);
    expect(nullActorDeletes[0]).toMatchObject({
      actorUserId: null,
      triggeredByUserId: null,
      workflowRunId: "typescript-null-run-4369",
      workflowType: null,
      requestStartTime: null,
      requestId: null,
    });

    const partialActorState = await readProjectState(observer, partialActorProjectId);
    const partialActorDeletes = partialActorState.audit.filter(
      ({ changeType }) => changeType === "delete",
    );
    expect(partialActorDeletes).toHaveLength(1);
    expect(partialActorDeletes[0]).toMatchObject({
      actorUserId: partialActorId,
      triggeredByUserId: null,
      workflowRunId: "typescript-partial-run-4369",
      workflowType: null,
      requestStartTime: null,
      requestId: null,
    });
  });
});
