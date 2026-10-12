import { createHash } from "node:crypto";
import { withAuditContext } from "@spark-workflow/audit-client";
import { recordAuditEntry } from "@spark-workflow/audit-client/persistence";
import { Value } from "@sinclair/typebox/value";
import { and, asc, desc, eq, isNull, or } from "drizzle-orm";

import {
  applicants,
  projectStatuses,
  projectVersionLocks,
  projects,
  topics,
} from "../db/schema.ts";
import type { ProjectLogicScope } from "../db.ts";
import { projectErrors } from "../errors.ts";
import { updateProjectStatusRecord } from "../project-status.ts";
import { lockProjectVersionWrites, ProjectVersions } from "../project-versions.ts";
import { ProjectInternalStatusSchema } from "../schemas.ts";
import type { ProjectDeletionWorkflowActorContext } from "@spark-temporal/contracts";
import type { TemplateTopic } from "./contracts.ts";

export interface ProjectLogicActivityRepository {
  listTopics(projectId: string): Promise<readonly TemplateTopic[]>;
  updateStatus(projectId: string, internalName: string): Promise<void>;
  deleteProject(
    projectId: string,
    projectVersion: number,
    actor: ProjectDeletionWorkflowActorContext | null,
    workflowRunId?: string,
  ): Promise<void>;
  latestVersion(projectId: string): Promise<number>;
  internalStatus(projectId: string): Promise<string | null>;
  acquireLock(
    projectId: string,
    sourceVersion: number,
    targetVersion: number,
    zipFileId: string | null,
    workflowRunId: string,
  ): Promise<string>;
  prepareRollback(
    projectId: string,
    sourceVersion: number,
    targetVersion: number,
    zipFileId: string | null,
    lockToken: string,
    workflowRunId: string,
  ): Promise<string>;
  releaseLock(projectId: string, lockToken: string, error?: string | null): Promise<void>;
  copyRoot(
    projectId: string,
    sourceVersion: number,
    targetVersion: number,
    lockToken: string,
    dryRun: boolean,
  ): Promise<{ copied: number }>;
  undoRoot(
    projectId: string,
    targetVersion: number,
    lockToken: string,
  ): Promise<{ project: number; applicant: number }>;
}

export class DrizzleProjectLogicActivityRepository implements ProjectLogicActivityRepository {
  constructor(
    private readonly scope: ProjectLogicScope,
    private readonly projectVersions: Pick<
      ProjectVersions,
      "ensureWritable" | "latestOne" | "validateLock"
    > = new ProjectVersions(scope),
  ) {}

  async listTopics(projectId: string): Promise<readonly TemplateTopic[]> {
    const version = await this.latestVersion(projectId);
    const rows = await this.scope.query((database) =>
      database
        .select()
        .from(topics)
        .where(
          and(
            eq(topics.projectId, projectId),
            eq(topics.projectVersion, version),
            eq(topics.isDeleted, false),
          ),
        )
        .orderBy(asc(topics.name))
        .limit(10_000),
    );
    return rows.map((row) => ({
      id: row.id,
      projectId: row.projectId,
      parentTopicId: row.parentTopicId,
      name: row.name,
      description: row.description,
      showInMvp: row.showInMvp,
      showInEwm: row.showInEwm,
      showInBeschluss: row.showInBeschluss,
      isDeleted: row.isDeleted,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));
  }

  async latestProject(projectId: string) {
    const [row] = await this.scope.query((database) =>
      database
        .select()
        .from(projects)
        .where(and(eq(projects.id, projectId), eq(projects.isDeleted, false)))
        .orderBy(desc(projects.projectVersion))
        .limit(1),
    );
    if (!row) throw new Error(`Project ${projectId} not found`);
    return row;
  }

  async updateStatus(projectId: string, internalName: string): Promise<void> {
    const result = await updateProjectStatusRecord(
      this.scope,
      this.projectVersions,
      projectId,
      Value.Parse(ProjectInternalStatusSchema, internalName),
    );
    if (result.isErr()) throw result.error;
  }

  async deleteProject(
    projectId: string,
    projectVersion: number,
    actor: ProjectDeletionWorkflowActorContext | null,
    workflowRunId?: string,
  ): Promise<void> {
    await this.scope.transact(async () => {
      await this.projectVersions.ensureWritable(projectId, projectVersion);
      await this.scope.query(async (transaction) => {
        const deleted = await transaction
          .update(projects)
          .set({ isDeleted: true })
          .where(and(eq(projects.id, projectId), eq(projects.isDeleted, false)))
          .returning({ id: projects.id });
        if (deleted.length === 0) return;
        await withAuditContext(
          {
            actorUserId: actor?.actorUserId ?? undefined,
            triggeredByUserId: actor?.triggeredByUserId ?? undefined,
            workflowType: actor?.workflowType ?? undefined,
            workflowRunId,
          },
          () =>
            recordAuditEntry(transaction, {
              projectId,
              entityId: projectId,
              entityType: "project",
              changeType: "delete",
            }),
        );
      });
    });
  }

  async latestVersion(projectId: string): Promise<number> {
    return (await this.latestProject(projectId)).projectVersion;
  }

  async internalStatus(projectId: string): Promise<string | null> {
    const [row] = await this.scope.query((database) =>
      database
        .select({ internalName: projectStatuses.internalName })
        .from(projects)
        .innerJoin(projectStatuses, eq(projects.statusId, projectStatuses.id))
        .where(and(eq(projects.id, projectId), eq(projects.isDeleted, false)))
        .orderBy(desc(projects.projectVersion))
        .limit(1),
    );
    return row?.internalName ?? null;
  }

  async acquireLock(
    projectId: string,
    sourceVersion: number,
    targetVersion: number,
    zipFileId: string | null,
    workflowRunId: string,
  ): Promise<string> {
    return this.scope.transact(() =>
      this.scope.query(async (transaction) => {
        await lockProjectVersionWrites(this.scope, projectId);
        const [owned] = await transaction
          .select()
          .from(projectVersionLocks)
          .where(eq(projectVersionLocks.id, workflowRunId))
          .limit(1);
        if (owned) {
          if (
            owned.projectId !== projectId ||
            owned.sourceVersion !== sourceVersion ||
            owned.targetVersion !== targetVersion ||
            owned.zipFileId !== zipFileId ||
            owned.status !== "ACTIVE"
          ) {
            throw projectErrors.CONFLICT({
              message: "The workflow reservation is closed or has different project version inputs",
            });
          }
          return owned.lockToken;
        }
        const [existing] = await transaction
          .select({ id: projectVersionLocks.id })
          .from(projectVersionLocks)
          .where(
            and(
              eq(projectVersionLocks.projectId, projectId),
              eq(projectVersionLocks.status, "ACTIVE"),
            ),
          )
          .limit(1);
        if (existing) {
          throw projectErrors.CONFLICT({
            message: `Project ${projectId} already has an active version lock`,
          });
        }
        const [source] = await transaction
          .select({ version: projects.projectVersion, status: projectStatuses.internalName })
          .from(projects)
          .leftJoin(projectStatuses, eq(projects.statusId, projectStatuses.id))
          .where(and(eq(projects.id, projectId), eq(projects.isDeleted, false)))
          .orderBy(desc(projects.projectVersion))
          .limit(1);
        if (!source) {
          throw projectErrors.NOT_FOUND({ message: `Project ${projectId} not found` });
        }
        if (source.version !== sourceVersion) {
          throw projectErrors.CONFLICT({
            message: `Provided project version ${sourceVersion} is not the latest version ${source.version}`,
          });
        }
        if (sourceVersion === targetVersion) {
          if (source.status !== "UPLOAD_DOCUMENTS" || zipFileId === null) {
            throw projectErrors.CONFLICT({
              message: "Only the first approved upload may reserve the current project version",
            });
          }
        } else {
          if (targetVersion !== sourceVersion + 1) {
            throw projectErrors.CONFLICT({ message: "The target must be the next project version" });
          }
          const [target] = await transaction
            .select({ id: projects.id })
            .from(projects)
            .where(and(eq(projects.id, projectId), eq(projects.projectVersion, targetVersion)))
            .limit(1);
          if (target) {
            throw projectErrors.CONFLICT({ message: "The target project version already exists" });
          }
        }
        const token = crypto.randomUUID().replaceAll("-", "");
        await transaction.insert(projectVersionLocks).values({
          id: workflowRunId,
          projectId,
          sourceVersion,
          targetVersion,
          zipFileId,
          lockToken: token,
          status: "ACTIVE",
        });
        return token;
      }),
    );
  }

  async prepareRollback(
    projectId: string,
    sourceVersion: number,
    targetVersion: number,
    zipFileId: string | null,
    lockToken: string,
    workflowRunId: string,
  ): Promise<string> {
    const rollbackToken = `rollback:${createHash("sha256")
      .update(
        JSON.stringify([projectId, sourceVersion, targetVersion, zipFileId, workflowRunId, lockToken]),
      )
      .digest("hex")}`;
    const [lock] = await this.scope.query((database) =>
      database
        .update(projectVersionLocks)
        .set({ lockToken: rollbackToken })
        .where(
          and(
            eq(projectVersionLocks.id, workflowRunId),
            eq(projectVersionLocks.projectId, projectId),
            eq(projectVersionLocks.sourceVersion, sourceVersion),
            eq(projectVersionLocks.targetVersion, targetVersion),
            zipFileId === null
              ? isNull(projectVersionLocks.zipFileId)
              : eq(projectVersionLocks.zipFileId, zipFileId),
            eq(projectVersionLocks.status, "ACTIVE"),
            or(
              eq(projectVersionLocks.lockToken, lockToken),
              eq(projectVersionLocks.lockToken, rollbackToken),
            ),
          ),
        )
        .returning({ lockToken: projectVersionLocks.lockToken }),
    );
    if (!lock) {
      throw projectErrors.CONFLICT({
        message: "The project version reservation cannot be prepared for rollback",
      });
    }
    return lock.lockToken;
  }

  async releaseLock(
    projectId: string,
    lockToken: string,
    error: string | null = null,
  ): Promise<void> {
    await this.scope.query((database) =>
      database
        .update(projectVersionLocks)
        .set({
          status: "RELEASED",
          error,
        })
        .where(
          and(
            eq(projectVersionLocks.projectId, projectId),
            eq(projectVersionLocks.lockToken, lockToken),
            eq(projectVersionLocks.status, "ACTIVE"),
          ),
        ),
    );
  }

  async copyRoot(
    projectId: string,
    sourceVersion: number,
    targetVersion: number,
    lockToken: string,
    dryRun: boolean,
  ): Promise<{ copied: number }> {
    return this.scope.transact(async () => {
      await this.projectVersions.validateLock({
        projectId,
        sourceVersion,
        targetVersion,
        lockToken,
      });
      return this.scope.query(async (transaction) => {
        const [source] = await transaction
          .select()
          .from(projects)
          .where(
            and(
              eq(projects.id, projectId),
              eq(projects.projectVersion, sourceVersion),
              eq(projects.isDeleted, false),
            ),
          )
          .limit(1);
        if (!source)
          throw new Error(`Project ${projectId} does not exist at version ${sourceVersion}`);
        const sourceApplicant =
          source.applicantId === null
            ? undefined
            : (
                await transaction
                  .select()
                  .from(applicants)
                  .where(
                    and(
                      eq(applicants.id, source.applicantId),
                      eq(applicants.projectId, projectId),
                      eq(applicants.projectVersion, sourceVersion),
                      eq(applicants.isDeleted, false),
                    ),
                  )
                  .limit(1)
              )[0];
        if (source.applicantId !== null && sourceApplicant === undefined) {
          throw new Error(
            `Applicant ${source.applicantId} does not exist at version ${sourceVersion}`,
          );
        }
        if (dryRun) return { copied: 1 + (sourceApplicant ? 1 : 0) };

        let copied = 0;
        if (sourceApplicant) {
          const [existing] = await transaction
            .select({ id: applicants.id })
            .from(applicants)
            .where(
              and(
                eq(applicants.id, sourceApplicant.id),
                eq(applicants.projectId, projectId),
                eq(applicants.projectVersion, targetVersion),
              ),
            )
            .limit(1);
          if (!existing) {
            const {
              sysPeriod: _sysPeriod,
              createdAt: _createdAt,
              updatedAt: _updatedAt,
              ...values
            } = sourceApplicant;
            await transaction.insert(applicants).values({
              ...values,
              projectId,
              projectVersion: targetVersion,
              isDeleted: false,
            });
            copied += 1;
          }
        }
        const [existingProject] = await transaction
          .select({ id: projects.id })
          .from(projects)
          .where(and(eq(projects.id, projectId), eq(projects.projectVersion, targetVersion)))
          .limit(1);
        if (!existingProject) {
          const {
            sysPeriod: _sysPeriod,
            createdAt: _createdAt,
            updatedAt: _updatedAt,
            ...values
          } = source;
          await transaction.insert(projects).values({
            ...values,
            projectVersion: targetVersion,
            isDeleted: false,
          });
          copied += 1;
        }
        return { copied };
      });
    });
  }

  undoRoot(
    projectId: string,
    targetVersion: number,
    lockToken: string,
  ): Promise<{ project: number; applicant: number }> {
    return this.scope.transact(async () => {
      const sourceVersion = await this.projectVersions.latestOne(projectId);
      await this.projectVersions.validateLock({
        projectId,
        sourceVersion,
        targetVersion,
        lockToken,
      });
      return this.scope.query(async (transaction) => {
        const [project] = await transaction
          .select({ applicantId: projects.applicantId })
          .from(projects)
          .where(and(eq(projects.id, projectId), eq(projects.projectVersion, targetVersion)))
          .limit(1);
        const deletedProject = await transaction
          .delete(projects)
          .where(and(eq(projects.id, projectId), eq(projects.projectVersion, targetVersion)))
          .returning({ id: projects.id });
        if (
          deletedProject.length === 0 ||
          project?.applicantId === null ||
          project?.applicantId === undefined
        ) {
          return { project: deletedProject.length, applicant: 0 };
        }
        const deletedApplicant = await transaction
          .delete(applicants)
          .where(
            and(
              eq(applicants.id, project.applicantId),
              eq(applicants.projectId, projectId),
              eq(applicants.projectVersion, targetVersion),
            ),
          )
          .returning({ id: applicants.id });
        return { project: deletedProject.length, applicant: deletedApplicant.length };
      });
    });
  }
}
