import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { SQL } from "bun";
import { and, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sql";

import {
  projectLogicSchema,
  projects,
  projectStatuses,
  projectVersionLocks,
} from "../src/db/schema.ts";
import type { ProjectLogicDatabase } from "../src/db.ts";
import { DrizzleProjectLogicActivityRepository } from "../src/temporal/activity-repository.ts";
import { ProjectVersions } from "../src/project-versions.ts";
import { testScope } from "./support/scopes.ts";

const databaseUrl = process.env.PLS_MUTATION_DATABASE_URL;
const databaseTests = databaseUrl ? describe : describe.skip;

databaseTests("Project version reservation ownership", () => {
  const client = new SQL(databaseUrl!, { max: 1, prepare: false });
  const database = drizzle({ client, schema: projectLogicSchema });
  const repository = new DrizzleProjectLogicActivityRepository(
    testScope<ProjectLogicDatabase>(database),
  );
  const projectIds: string[] = [];
  const statusIds: string[] = [];
  afterAll(() => client.close());

  afterEach(async () => {
    await database
      .delete(projectVersionLocks)
      .where(inArray(projectVersionLocks.projectId, projectIds));
    await database.delete(projects).where(inArray(projects.id, projectIds));
    await database.delete(projectStatuses).where(inArray(projectStatuses.id, statusIds));
    projectIds.length = 0;
    statusIds.length = 0;
  });

  async function createProject(status = "OPEN") {
    const projectId = crypto.randomUUID();
    const statusId = crypto.randomUUID();
    projectIds.push(projectId);
    statusIds.push(statusId);
    await database.insert(projectStatuses).values({ id: statusId, internalName: status });
    await database
      .insert(projects)
      .values({ id: projectId, statusId, createdById: crypto.randomUUID() });
    return projectId;
  }

  test("recovers its token after a lost acquisition reply, including after root copy", async () => {
    const projectId = await createProject();
    const runId = crypto.randomUUID();
    const token = await repository.acquireLock(projectId, 1, 2, null, runId);
    expect(await repository.acquireLock(projectId, 1, 2, null, runId)).toBe(token);
    await repository.copyRoot(projectId, 1, 2, token, false);
    expect(await repository.acquireLock(projectId, 1, 2, null, runId)).toBe(token);
    await repository.undoRoot(projectId, 2, token);
    await repository.releaseLock(projectId, token, "compensated");
    expect(await repository.latestVersion(projectId)).toBe(1);
  });

  test("rejects a delayed stale approval without adopting or deleting the committed version", async () => {
    const projectId = await createProject();
    const token = await repository.acquireLock(projectId, 1, 2, null, crypto.randomUUID());
    await repository.copyRoot(projectId, 1, 2, token, false);
    await repository.releaseLock(projectId, token);
    const before = await database.select().from(projects).where(eq(projects.id, projectId));
    await expect(
      repository.acquireLock(projectId, 1, 2, null, crypto.randomUUID()),
    ).rejects.toThrow();
    expect(await database.select().from(projects).where(eq(projects.id, projectId))).toEqual(
      before,
    );
  });

  test("rejects foreign runs, changed bindings, and released operation retries", async () => {
    const projectId = await createProject();
    const runId = crypto.randomUUID();
    const zipFileId = crypto.randomUUID();
    const token = await repository.acquireLock(projectId, 1, 2, zipFileId, runId);
    const versions = new ProjectVersions(testScope<ProjectLogicDatabase>(database));
    await versions.validateLock({
      projectId,
      sourceVersion: 1,
      targetVersion: 2,
      zipFileId,
      lockToken: token,
    });
    await expect(
      versions.validateLock({
        projectId,
        sourceVersion: 1,
        targetVersion: 2,
        zipFileId: crypto.randomUUID(),
        lockToken: token,
      }),
    ).rejects.toThrow();
    await expect(
      repository.acquireLock(projectId, 1, 2, zipFileId, crypto.randomUUID()),
    ).rejects.toThrow();
    await expect(repository.acquireLock(projectId, 2, 3, zipFileId, runId)).rejects.toThrow();
    await expect(repository.acquireLock(projectId, 1, 3, zipFileId, runId)).rejects.toThrow();
    await expect(
      repository.acquireLock(projectId, 1, 2, crypto.randomUUID(), runId),
    ).rejects.toThrow();
    await repository.releaseLock(projectId, token);
    await expect(repository.acquireLock(projectId, 1, 2, zipFileId, runId)).rejects.toThrow();
  });

  test("admits only the current first-upload version without a version bump", async () => {
    const projectId = await createProject("UPLOAD_DOCUMENTS");
    const runId = crypto.randomUUID();
    const zipFileId = crypto.randomUUID();
    const token = await repository.acquireLock(projectId, 1, 1, zipFileId, runId);
    expect(await repository.acquireLock(projectId, 1, 1, zipFileId, runId)).toBe(token);
    await repository.releaseLock(projectId, token);
    const openProject = await createProject();
    await expect(
      repository.acquireLock(openProject, 1, 1, zipFileId, crypto.randomUUID()),
    ).rejects.toThrow();
  });

  test("rejects deleted projects and existing tombstoned target versions", async () => {
    const projectId = await createProject();
    await database.insert(projects).values({
      id: projectId,
      projectVersion: 2,
      isDeleted: true,
      createdById: crypto.randomUUID(),
    });
    await expect(
      repository.acquireLock(projectId, 1, 2, null, crypto.randomUUID()),
    ).rejects.toThrow();
    await database.update(projects).set({ isDeleted: true }).where(eq(projects.id, projectId));
    await expect(
      repository.acquireLock(projectId, 1, 2, null, crypto.randomUUID()),
    ).rejects.toThrow();
  });

  test("preserves an ownerless legacy reservation rather than adopting its token", async () => {
    const projectId = await createProject();
    const legacy = {
      id: crypto.randomUUID(),
      projectId,
      sourceVersion: 1,
      targetVersion: 2,
      lockToken: crypto.randomUUID(),
    };
    await database.insert(projectVersionLocks).values(legacy);
    await expect(
      repository.acquireLock(projectId, 1, 2, null, crypto.randomUUID()),
    ).rejects.toThrow();
    expect(
      await database
        .select()
        .from(projectVersionLocks)
        .where(
          and(eq(projectVersionLocks.id, legacy.id), eq(projectVersionLocks.status, "ACTIVE")),
        ),
    ).toHaveLength(1);
  });

  test("recovers a lost rollback-fence reply and rejects late copies with the original token", async () => {
    const projectId = await createProject();
    const runId = crypto.randomUUID();
    const zipFileId = crypto.randomUUID();
    const token = await repository.acquireLock(projectId, 1, 2, zipFileId, runId);
    await repository.copyRoot(projectId, 1, 2, token, false);
    await expect(
      repository.prepareRollback(projectId, 1, 2, zipFileId, token, crypto.randomUUID()),
    ).rejects.toThrow();
    await expect(
      repository.prepareRollback(projectId, 1, 2, crypto.randomUUID(), token, runId),
    ).rejects.toThrow();
    const rollback = await repository.prepareRollback(projectId, 1, 2, zipFileId, token, runId);
    expect(await repository.prepareRollback(projectId, 1, 2, zipFileId, token, runId)).toBe(
      rollback,
    );
    await expect(repository.copyRoot(projectId, 1, 2, token, false)).rejects.toThrow();
    await repository.undoRoot(projectId, 2, rollback);
    await expect(repository.copyRoot(projectId, 1, 2, token, false)).rejects.toThrow();
    await repository.releaseLock(projectId, rollback);
    expect(await repository.latestVersion(projectId)).toBe(1);
  });

  test("waits for a copy transaction before fencing and undoing its late commit", async () => {
    const projectId = await createProject();
    const runId = crypto.randomUUID();
    const token = await repository.acquireLock(projectId, 1, 2, null, runId);
    const copyClient = new SQL(databaseUrl!, { max: 1, prepare: false });
    const observer = new SQL(databaseUrl!, { max: 1, prepare: false });
    const copyScope = testScope<ProjectLogicDatabase>(
      drizzle({ client: copyClient, schema: projectLogicSchema }),
    );
    const versions = new ProjectVersions(copyScope);
    const held = Promise.withResolvers<void>();
    const proceed = Promise.withResolvers<void>();
    const copying = copyScope.transact(async () => {
      await versions.validateLock({
        projectId,
        sourceVersion: 1,
        targetVersion: 2,
        lockToken: token,
      });
      held.resolve();
      await proceed.promise;
      await copyScope.query((transaction) =>
        transaction
          .insert(projects)
          .values({ id: projectId, projectVersion: 2, createdById: crypto.randomUUID() }),
      );
    });
    try {
      await held.promise;
      const fencing = repository.prepareRollback(projectId, 1, 2, null, token, runId);
      let waiting = false;
      for (let attempt = 0; attempt < 100 && !waiting; attempt++) {
        const rows =
          await observer`select pid from pg_stat_activity where datname=current_database() and wait_event_type='Lock' and query like 'update "project_version_lock"%'`;
        waiting = rows.length > 0;
        if (!waiting) await Bun.sleep(10);
      }
      expect(waiting).toBeTrue();
      proceed.resolve();
      await copying;
      const rollbackToken = await fencing;
      await expect(repository.copyRoot(projectId, 1, 2, token, false)).rejects.toThrow();
      await repository.undoRoot(projectId, 2, rollbackToken);
      await repository.releaseLock(projectId, rollbackToken);
      expect(await repository.latestVersion(projectId)).toBe(1);
    } finally {
      proceed.resolve();
      await copying;
      await Promise.all([copyClient.close(), observer.close()]);
    }
  });
});
