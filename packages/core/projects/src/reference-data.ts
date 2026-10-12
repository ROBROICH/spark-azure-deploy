import { recordRequestAudit } from "@spark-workflow/http-host";
import { PostgreSQL } from "@spark-workflow/postgres-runtime";
import { defineResource, provide } from "@spark-workflow/resource";
import { type Static, Type as T } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import { sql } from "drizzle-orm";
import { defineAuditCatalog } from "evlog";

import { projectLogicSchema, projectTypes } from "./db/schema.ts";
import { projectLogicModels, type ProjectLogicDatabase, type ProjectLogicScope } from "./db.ts";
import { projectErrors } from "./errors.ts";
import { CreateProjectTypeSchema, UpdateProjectTypeSchema } from "./schemas.ts";

const projectTypeAudit = defineAuditCatalog("project-logic", {
  PROJECT_TYPES_CREATE: { target: "project_type", severity: "high", requiresChanges: true },
  PROJECT_TYPES_UPDATE: { target: "project_type", severity: "high", requiresChanges: true },
  PROJECT_TYPES_DELETE: { target: "project_type", severity: "high", requiresChanges: true },
});

type ProjectTypeUpdate = Omit<Static<typeof UpdateProjectTypeSchema>, "name"> &
  Partial<Pick<Static<typeof UpdateProjectTypeSchema>, "name">>;

export const listProjectStatuses = (scope: ProjectLogicScope) =>
  scope.query(async (client: ProjectLogicDatabase) =>
    (
      await projectLogicModels(client).projectStatuses.findMany({
        select: { id: true, name: true, internalName: true },
      })
    ).map((row) => ({ ...row, name: row.name ?? "" })),
  );

export const listProjectTypes = (scope: ProjectLogicScope) =>
  scope.query((client: ProjectLogicDatabase) =>
    projectLogicModels(client).projectTypes.findMany({
      select: { id: true, name: true, active: true },
    }),
  );

export const createProjectTypes = async (
  scope: ProjectLogicScope,
  input: readonly Static<typeof CreateProjectTypeSchema>[],
) => {
  if (input.length === 0) return [];
  const result = await scope.query((client: ProjectLogicDatabase) =>
    projectLogicModels(client).projectTypes.createMany({
      data: input.map(({ name }) => ({ id: crypto.randomUUID(), name })),
      select: { id: true, name: true, active: true },
    }),
  );
  const created = result.data ?? [];
  recordRequestAudit((actor) => projectTypeAudit.PROJECT_TYPES_CREATE({ actor, changes: { after: created } }));
  return created;
};

export const updateProjectTypes = async (
  scope: ProjectLogicScope,
  input: readonly ProjectTypeUpdate[],
) => {
  if (new Set(input.map(({ id }) => id)).size !== input.length) {
    throw projectErrors.INVALID_REQUEST({ message: "Project type IDs must be unique" });
  }
  if (input.length === 0) return [];
  const result = await scope.query((client: ProjectLogicDatabase) =>
    projectLogicModels(client).projectTypes.updateEach({
      by: projectTypes.id,
      data: [...input],
      update: {
        name: (row) => {
          if (Value.Check(T.String(), row.name)) return row.name;
          return sql`${projectTypes.name}`;
        },
        active: (row) => {
          if (Value.Check(T.Boolean(), row.active)) return row.active;
          return sql`${projectTypes.active}`;
        },
      },
      select: { id: true, name: true, active: true },
    }),
  );
  if (result.count === 0) return [];
  const updated = result.data ?? [];
  recordRequestAudit((actor) => projectTypeAudit.PROJECT_TYPES_UPDATE({ actor, changes: { after: updated } }));
  return updated;
};

export const deleteProjectTypes = async (scope: ProjectLogicScope, ids: readonly string[]) => {
  if (new Set(ids).size !== ids.length) {
    throw projectErrors.INVALID_REQUEST({ message: "Project type IDs must be unique" });
  }
  if (ids.length === 0) return [];
  const deleted = await scope.query(async (client: ProjectLogicDatabase) => {
    const database = projectLogicModels(client);
    const existing = await database.projectTypes.findMany({
      select: { id: true, name: true, active: true },
      where: { id: { in: [...ids] } },
    });
    const existingIds = new Set(existing.map(({ id }) => id));
    const missing = ids.find((id) => !existingIds.has(id));
    if (missing) throw projectErrors.NOT_FOUND({ message: `ProjectType ${missing} not found` });
    const referenced = await database.projects.findMany({
      select: { projectTypeId: true },
      where: { projectTypeId: { in: [...ids] }, isDeleted: false },
    });
    if (referenced.length > 0) {
      throw projectErrors.CONFLICT({
        message: "Project type is referenced by a procedure; deactivate it instead",
      });
    }
    await database.projectTypes.deleteMany({ where: { id: { in: [...ids] } } });
    return existing;
  });
  recordRequestAudit((actor) => projectTypeAudit.PROJECT_TYPES_DELETE({ actor, changes: { before: deleted } }));
  return deleted;
};

export const listProcessSteps = (scope: ProjectLogicScope, projectTypeId?: string) =>
  scope.query(async (client: ProjectLogicDatabase) =>
    (
      await projectLogicModels(client).processSteps.findMany({
        select: { id: true, name: true, projectTypeId: true, processStepIndex: true },
        where: projectTypeId ? { projectTypeId } : undefined,
      })
    ).map((row) => ({
      id: row.id,
      name: row.name ?? "",
      projectTypeId: row.projectTypeId ?? "",
      processStepIndex: row.processStepIndex ?? 0,
    })),
  );

export const getProcessStep = async (scope: ProjectLogicScope, processStepId: string) => {
  const row = await scope.query((client: ProjectLogicDatabase) =>
    projectLogicModels(client).processSteps.findOne({
      select: { id: true, name: true, projectTypeId: true, processStepIndex: true },
      where: { id: processStepId },
    }),
  );
  if (row === null) {
    throw projectErrors.NOT_FOUND({ message: `ProcessStep ${processStepId} not found` });
  }
  return {
    id: row.id,
    name: row.name ?? "",
    projectTypeId: row.projectTypeId ?? "",
    processStepIndex: row.processStepIndex ?? 0,
  };
};

type ProjectTypePatch = Partial<Omit<Static<typeof UpdateProjectTypeSchema>, "id">>;

export interface ProjectTypesService {
  list(): ReturnType<typeof listProjectTypes>;
  findUnique(projectTypeId: string): Promise<Awaited<ReturnType<typeof listProjectTypes>>[number]>;
  create(
    input: Static<typeof CreateProjectTypeSchema>,
  ): Promise<Awaited<ReturnType<typeof listProjectTypes>>[number]>;
  update(
    projectTypeId: string,
    input: ProjectTypePatch,
  ): Promise<Awaited<ReturnType<typeof listProjectTypes>>[number]>;
  delete(projectTypeId: string): Promise<Awaited<ReturnType<typeof listProjectTypes>>[number]>;
}

export interface ProjectStatusesService {
  list(): ReturnType<typeof listProjectStatuses>;
  findUnique(
    projectStatusId: string,
  ): Promise<Awaited<ReturnType<typeof listProjectStatuses>>[number]>;
}

export interface ProcessStepsService {
  list(projectTypeId?: string): ReturnType<typeof listProcessSteps>;
  findUnique(processStepId: string): ReturnType<typeof getProcessStep>;
}

export const ProjectTypes = defineResource<ProjectTypesService>()("core/ProjectTypes");
export const ProjectStatuses = defineResource<ProjectStatusesService>()("core/ProjectStatuses");
export const ProcessSteps = defineResource<ProcessStepsService>()("core/ProcessSteps");

const required = <Row>(row: Row | undefined, kind: string, id: string): Row => {
  if (row === undefined) throw projectErrors.NOT_FOUND({ message: `${kind} ${id} not found` });
  return row;
};

export const projectTypesProvider = provide({
  resource: ProjectTypes,
  needs: { postgres: PostgreSQL },
  make: ({ postgres }) => {
    const scope = postgres.scope(projectLogicSchema);
    const list = () => listProjectTypes(scope);
    return Object.freeze<ProjectTypesService>({
      list,
      async findUnique(projectTypeId) {
        return required(
          (await list()).find(({ id }) => id === projectTypeId),
          "ProjectType",
          projectTypeId,
        );
      },
      async create(input) {
        const [created] = await createProjectTypes(scope, [input]);
        if (created === undefined) {
          throw projectErrors.UNAVAILABLE({ message: "Project type creation returned no row" });
        }
        return created;
      },
      async update(projectTypeId, input) {
        const [updated] = await updateProjectTypes(scope, [{ ...input, id: projectTypeId }]);
        return required(updated, "ProjectType", projectTypeId);
      },
      async delete(projectTypeId) {
        const [deleted] = await deleteProjectTypes(scope, [projectTypeId]);
        return required(deleted, "ProjectType", projectTypeId);
      },
    });
  },
});

export const projectStatusesProvider = provide({
  resource: ProjectStatuses,
  needs: { postgres: PostgreSQL },
  make: ({ postgres }) => {
    const scope = postgres.scope(projectLogicSchema);
    const list = () => listProjectStatuses(scope);
    return Object.freeze<ProjectStatusesService>({
      list,
      async findUnique(projectStatusId) {
        return required(
          (await list()).find(({ id }) => id === projectStatusId),
          "ProjectStatus",
          projectStatusId,
        );
      },
    });
  },
});

export const processStepsProvider = provide({
  resource: ProcessSteps,
  needs: { postgres: PostgreSQL },
  make: ({ postgres }) => {
    const scope = postgres.scope(projectLogicSchema);
    return Object.freeze<ProcessStepsService>({
      list: (projectTypeId) => listProcessSteps(scope, projectTypeId),
      findUnique: (processStepId) => getProcessStep(scope, processStepId),
    });
  },
});
