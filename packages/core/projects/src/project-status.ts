import { recordAuditEntry } from "@spark-workflow/audit-client/persistence";
import { Result } from "better-result";
import { and, eq } from "drizzle-orm";

import { projects } from "./db/schema.ts";
import { projectLogicModels, type ProjectLogicScope } from "./db.ts";
import { projectErrors } from "./errors.ts";
import { loadProjectRows } from "./project-row-loader.ts";
import type { ProjectVersions } from "./project-versions.ts";
import type { ProjectInternalStatus } from "./schemas.ts";

const statusOrder = new Map<string, number>([
  ["IN_CREATION", 0],
  ["UPLOAD_DOCUMENTS", 1],
  ["OPEN", 2],
  ["IN_PROGRESS", 3],
  ["COMPLETED", 4],
]);

export async function updateProjectStatusRecord(
  scope: ProjectLogicScope,
  projectVersions: Pick<ProjectVersions, "ensureWritable" | "latestOne">,
  projectId: string,
  internalName: ProjectInternalStatus,
) {
  return scope.transact(async () => {
    const candidateVersion = await projectVersions.latestOne(projectId);
    const version = await projectVersions.ensureWritable(projectId, candidateVersion);
    const [current] = await scope.query((database) =>
      loadProjectRows(
        database,
        and(
          eq(projects.id, projectId),
          eq(projects.projectVersion, version),
          eq(projects.isDeleted, false),
        ),
        1,
      ),
    );
    if (current === undefined) {
      return Result.err(projectErrors.NOT_FOUND({ message: `Project ${projectId} not found` }));
    }
    const [currentStatus, nextStatus] = await scope.query((database) => {
      const models = projectLogicModels(database);
      return Promise.all([
        current.statusId
          ? models.projectStatuses.findOne({ where: { id: current.statusId } })
          : undefined,
        models.projectStatuses.findOne({ where: { internalName } }),
      ]);
    });
    if (!nextStatus) {
      return Result.err(
        projectErrors.INVALID_REQUEST({
          message: `Invalid project status '${internalName}'`,
        }),
      );
    }
    if (currentStatus?.internalName === nextStatus.internalName) return Result.ok(undefined);
    if (
      (statusOrder.get(nextStatus.internalName) ?? -1) <=
      (statusOrder.get(currentStatus?.internalName ?? "") ?? -1)
    ) {
      return Result.err(
        projectErrors.INVALID_REQUEST({
          message: `Invalid project status transition from '${currentStatus?.internalName ?? "UNKNOWN"}' to '${nextStatus.internalName}'`,
        }),
      );
    }
    await scope.query(async (transaction) => {
      await transaction
        .update(projects)
        .set({ statusId: nextStatus.id })
        .where(
          and(eq(projects.id, projectId), eq(projects.projectVersion, current.projectVersion)),
        );
      await recordAuditEntry(transaction, {
        projectId,
        entityId: projectId,
        entityType: "project",
        changeType: "update",
      });
    });
    return Result.ok(undefined);
  });
}
