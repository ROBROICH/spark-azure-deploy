import { and, eq } from "drizzle-orm";

import { projects } from "./db/schema.ts";
import type { ProjectLogicScope } from "./db.ts";
import { projectErrors } from "./errors.ts";
import type { ProjectVersions } from "./project-versions.ts";

export { projectErrors } from "./errors.ts";
export { ProjectVersions } from "./project-versions.ts";

export interface ProjectExportMetadata {
  readonly name: string;
  readonly internalProjectNumber: string;
  readonly latestVersion: number;
}

export async function getProjectExportMetadata(
  scope: ProjectLogicScope,
  projectVersions: Pick<ProjectVersions, "latestOne">,
  projectId: string,
): Promise<ProjectExportMetadata> {
  const latestVersion = await projectVersions.latestOne(projectId);
  const [project] = await scope.query((database) =>
    database
      .select({ name: projects.name, internalProjectNumber: projects.internalProjectNumber })
      .from(projects)
      .where(
        and(
          eq(projects.id, projectId),
          eq(projects.projectVersion, latestVersion),
          eq(projects.isDeleted, false),
        ),
      )
      .limit(1),
  );
  if (project === undefined) {
    throw projectErrors.NOT_FOUND({ message: `Project ${projectId} not found` });
  }
  return {
    name: project.name ?? "",
    internalProjectNumber: project.internalProjectNumber ?? "",
    latestVersion,
  };
}
