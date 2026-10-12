import type { ProjectVersionPeer, VersionLockValidation } from "@spark-workflow/node-crud";
import { persistenceError } from "@spark-workflow/postgres-runtime";
import { Result } from "better-result";
import { and, eq, inArray, max, sql } from "drizzle-orm";

import { projects, projectVersionLocks } from "./db/schema.ts";
import type { ProjectLogicScope } from "./db.ts";
import { projectErrors } from "./errors.ts";

export async function lockProjectVersionWrites(
  database: ProjectLogicScope,
  projectId: string,
): Promise<void> {
  await database.query((query) =>
    query.execute(sql`select pg_advisory_xact_lock(hashtextextended(${projectId}, 0))`),
  );
}

export class ProjectVersions implements ProjectVersionPeer {
  constructor(private readonly database: ProjectLogicScope) {}

  async latest(projectIds?: readonly string[]): Promise<Map<string, number>> {
    if (projectIds?.length === 0) return new Map();
    return this.database.query(async (database) => {
      const projectQuery = database
        .select({ id: projects.id, version: max(projects.projectVersion) })
        .from(projects)
        .where(
          and(
            eq(projects.isDeleted, false),
            ...(projectIds ? [inArray(projects.id, [...projectIds])] : []),
          ),
        )
        .groupBy(projects.id);
      const lockQuery = database
        .select({
          projectId: projectVersionLocks.projectId,
          sourceVersion: projectVersionLocks.sourceVersion,
        })
        .from(projectVersionLocks)
        .where(
          and(
            eq(projectVersionLocks.status, "ACTIVE"),
            ...(projectIds ? [inArray(projectVersionLocks.projectId, [...projectIds])] : []),
          ),
        );
      const [projectRows, lockRows] = await Promise.all([projectQuery, lockQuery]);
      const result = new Map(
        projectRows.flatMap(({ id, version }) =>
          version === null ? [] : [[id, Number(version)]],
        ),
      );
      for (const lock of lockRows) result.set(lock.projectId, lock.sourceVersion);
      return result;
    });
  }

  async latestOne(projectId: string): Promise<number> {
    const version = (await this.latest([projectId])).get(projectId);
    if (version === undefined) {
      throw projectErrors.NOT_FOUND({ message: `Project ${projectId} not found` });
    }
    return version;
  }

  resolveLatestVersion(projectId: string) {
    return Result.tryPromise({
      try: () => this.latestOne(projectId),
      catch: persistenceError,
    });
  }

  validateWriteVersion(projectId: string, projectVersion: number) {
    return Result.tryPromise({
      try: async () => {
        await this.ensureWritable(projectId, projectVersion);
      },
      catch: persistenceError,
    });
  }

  async ensureWritable(projectId: string, projectVersion: number): Promise<number> {
    await lockProjectVersionWrites(this.database, projectId);
    const [lock] = await this.database.query((database) =>
      database
        .select({ id: projectVersionLocks.id })
        .from(projectVersionLocks)
        .where(
          and(
            eq(projectVersionLocks.projectId, projectId),
            eq(projectVersionLocks.status, "ACTIVE"),
          ),
        )
        .limit(1)
        .for("share"),
    );
    if (lock) {
      throw projectErrors.CONFLICT({
        message: `Project ${projectId} has an active version creation lock`,
      });
    }
    const latest = await this.latestOne(projectId);
    if (latest !== projectVersion) {
      throw projectErrors.CONFLICT({
        message: `Provided project version ${projectVersion} is not the latest version ${latest}`,
      });
    }
    return latest;
  }

  async validateLock(input: VersionLockValidation): Promise<void> {
    const latest = await this.latestOne(input.projectId);
    if (latest !== input.sourceVersion) {
      throw projectErrors.CONFLICT({
        message: `Provided project version ${input.sourceVersion} is not the latest version ${latest}`,
      });
    }
    const [lock] = await this.database.query((database) =>
      database
        .select({ id: projectVersionLocks.id })
        .from(projectVersionLocks)
        .where(
          and(
            eq(projectVersionLocks.projectId, input.projectId),
            eq(projectVersionLocks.sourceVersion, input.sourceVersion),
            eq(projectVersionLocks.targetVersion, input.targetVersion),
            eq(projectVersionLocks.lockToken, input.lockToken),
            input.zipFileId === undefined
              ? undefined
              : eq(projectVersionLocks.zipFileId, input.zipFileId),
            eq(projectVersionLocks.status, "ACTIVE"),
          ),
        )
        .limit(1)
        .for("share"),
    );
    if (!lock) {
      throw projectErrors.CONFLICT({
        message: "Project version lock is not active or does not match the requested version",
      });
    }
  }

  validateVersionLock(input: VersionLockValidation) {
    return Result.tryPromise({
      try: () => this.validateLock(input),
      catch: persistenceError,
    });
  }
}
