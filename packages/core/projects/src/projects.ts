import { isoInstant } from "@spark-workflow/http-host";
import { currentAuditContext } from "@spark-workflow/audit-client";
import { recordAuditEntry } from "@spark-workflow/audit-client/persistence";
import { listProjectRelations } from "@spark-workflow/authentification";
import { Result } from "better-result";
import { and, asc, count, desc, eq, gte, inArray, max, notInArray, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { searchContains } from "../../src/search.ts";
import { applicants, projects, projectStatuses, projectTypes, projectVersionLocks } from "./db/schema.ts";
import { projectLogicModels, type ProjectLogicDatabase, type ProjectLogicScope } from "./db.ts";
import { projectErrors } from "./errors.ts";
import { createProjectRecord, stateCodes, type ProjectCreationInput } from "./project-creation.ts";
import { loadProjectRows, projectEntryDateForStorage } from "./project-row-loader.ts";
import { ProjectVersions } from "./project-versions.ts";
import type { ApplicantResponse, ProjectResponse, UpdateProject } from "./schemas.ts";

const stateNames = Object.fromEntries(
  Object.entries(stateCodes).map(([name, code]) => [code, name]),
) as Record<string, keyof typeof stateCodes>;

type ProjectRow = typeof projects.$inferSelect;
type ApplicantRow = typeof applicants.$inferSelect;

interface JoinedProject {
  project: ProjectRow;
  projectTypeName: string;
  statusName: string;
  applicant: ApplicantRow | null;
}

const auditActor = () => {
  const context = currentAuditContext();
  return {
    actorUserId: context.actorUserId ?? null,
    triggeredByUserId: context.triggeredByUserId ?? null,
    workflowType: context.workflowType ?? null,
  };
};

const memberships = async (projectIds: readonly string[]) => {
  if (projectIds.length === 0) return Result.ok({});
  return listProjectRelations({
    resourceType: "project",
    resourceIds: projectIds,
    relations: ["owner", "member", "auditor"],
  });
};

const joinedRows = async (
  scope: ProjectLogicScope,
  rows: readonly ProjectRow[],
): Promise<JoinedProject[]> => {
  if (rows.length === 0) return [];
  const typeIds = [
    ...new Set(rows.flatMap(({ projectTypeId }) => (projectTypeId ? [projectTypeId] : []))),
  ];
  const statusIds = [...new Set(rows.flatMap(({ statusId }) => (statusId ? [statusId] : [])))];
  const applicantIds = [
    ...new Set(rows.flatMap(({ applicantId }) => (applicantId ? [applicantId] : []))),
  ];
  const [typeRows, statusRows, applicantRows] = await scope.query((client) => {
    const database = projectLogicModels(client);
    return Promise.all([
      typeIds.length ? database.projectTypes.findMany({ where: { id: { in: typeIds } } }) : [],
      statusIds.length
        ? database.projectStatuses.findMany({ where: { id: { in: statusIds } } })
        : [],
      applicantIds.length
        ? database.applicants.findMany({ where: { id: { in: applicantIds } } })
        : [],
    ]);
  });
  const typesById = new Map(typeRows.map((row) => [row.id, row.name]));
  const statusesById = new Map(statusRows.map((row) => [row.id, row.name ?? ""]));
  const applicantsByKey = new Map(
    applicantRows.map((row) => [`${row.id}:${row.projectVersion}`, row]),
  );
  return rows.map((project) => ({
    project,
    projectTypeName: project.projectTypeId ? (typesById.get(project.projectTypeId) ?? "") : "",
    statusName: project.statusId ? (statusesById.get(project.statusId) ?? "") : "",
    applicant: project.applicantId
      ? (applicantsByKey.get(`${project.applicantId}:${project.projectVersion}`) ?? null)
      : null,
  }));
};

const present = (
  row: JoinedProject,
  relationsByProject: Record<string, Partial<Record<"owner" | "member" | "auditor", string[]>>>,
): ProjectResponse => {
  const project = row.project;
  const applicant = row.applicant;
  const relations = relationsByProject[project.id] ?? {};
  return {
    id: project.id,
    name: project.name ?? "",
    projectTypeId: project.projectTypeId ?? "",
    projectTypeName: row.projectTypeName,
    createdById: project.createdById,
    entryDate: project.entryDate ?? "",
    internalProjectNumber: project.internalProjectNumber ?? "",
    state: project.state ? (stateNames[project.state] ?? null) : null,
    imported: project.imported,
    owners: relations.owner ?? [],
    members: relations.member ?? [],
    auditors: relations.auditor ?? [],
    salutation: applicant?.salutation ?? null,
    company: applicant?.company ?? null,
    firstName: applicant?.firstName ?? null,
    lastName: applicant?.lastName ?? null,
    street: applicant?.street ?? null,
    houseNumber: applicant?.houseNumber ?? null,
    addressSupplement: applicant?.addressSupplement ?? null,
    plz: applicant?.plz ?? null,
    location: applicant?.location ?? null,
    country: applicant?.country ?? null,
    email: applicant?.email ?? null,
    phone: applicant?.phone ?? null,
    fax: applicant?.fax ?? null,
    statusId: project.statusId ?? "",
    statusName: row.statusName,
    currentProcessStepId: project.currentProcessStepId,
    createdAt: isoInstant(project.createdAt),
    originalCreatedAt: isoInstant(project.originalCreatedAt),
    updatedAt: isoInstant(project.updatedAt),
    projectVersion: project.projectVersion,
    latestVersion: project.projectVersion,
  };
};

const currentRow = async (scope: ProjectLogicScope, projectId: string) => {
  const projectVersions = new ProjectVersions(scope);
  const version = await projectVersions.latestOne(projectId);
  const [row] = await scope.query((database) =>
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
  if (!row) {
    return Result.err(projectErrors.NOT_FOUND({ message: `Project ${projectId} not found` }));
  }
  return Result.ok(row);
};

export const getProject = async (scope: ProjectLogicScope, projectId: string) => {
  const current = await currentRow(scope, projectId);
  if (current.isErr()) return current;
  const rows = await joinedRows(scope, [current.value]);
  const relations = await memberships([projectId]);
  if (relations.isErr()) return relations;
  return Result.ok(present(rows[0]!, relations.value));
};

export const listProjectApplicants = async (
  scope: ProjectLogicScope,
  projectId: string,
  projectVersion: number,
) => {
  const [project] = await scope.query((database) =>
    loadProjectRows(
      database,
      and(
        eq(projects.id, projectId),
        eq(projects.projectVersion, projectVersion),
        eq(projects.isDeleted, false),
      ),
      1,
    ),
  );
  if (project === undefined) {
    return Result.err(
      projectErrors.NOT_FOUND({
        message: `Project ${projectId} version ${projectVersion} not found`,
      }),
    );
  }
  const [joined] = await joinedRows(scope, [project]);
  const applicant = joined?.applicant;
  if (applicant === null || applicant === undefined || applicant.isDeleted) {
    return Result.ok([]);
  }
  const response: ApplicantResponse = {
    id: applicant.id,
    projectId: applicant.projectId,
    projectVersion: applicant.projectVersion,
    salutation: applicant.salutation,
    company: applicant.company,
    firstName: applicant.firstName,
    lastName: applicant.lastName,
    street: applicant.street,
    houseNumber: applicant.houseNumber,
    addressSupplement: applicant.addressSupplement,
    plz: applicant.plz,
    location: applicant.location,
    country: applicant.country,
    email: applicant.email,
    phone: applicant.phone,
    fax: applicant.fax,
  };
  return Result.ok([response]);
};

export const activeProjectVersion = (database: ProjectLogicDatabase) => {
  const versions = alias(projects, "project_list_versions");
  const latest = database.select({ version: max(versions.projectVersion) }).from(versions)
    .where(and(eq(versions.id, projects.id), eq(versions.isDeleted, false)));
  const locked = database.select({ version: projectVersionLocks.sourceVersion })
    .from(projectVersionLocks)
    .where(and(eq(projectVersionLocks.projectId, projects.id), eq(projectVersionLocks.status, "ACTIVE")))
    .limit(1);
  return sql<number>`coalesce((${locked}), (${latest}))`;
};

export const listProjects = async (
  scope: ProjectLogicScope,
  input: {
    name?: string;
    search?: string;
    statuses?: readonly string[];
    projectTypeNames?: readonly string[];
    statusNames?: readonly string[];
    imported?: boolean;
    ids?: readonly string[];
    excludeIds?: readonly string[];
    accessibleIds?: readonly string[];
    projectCutOffDate?: Date;
    limit?: number;
    offset?: number;
    sort?: "name" | "internalProjectNumber" | "projectTypeName" | "statusName" | "originalCreatedAt" | "updatedAt" | "id";
    direction?: "asc" | "desc";
  },
) => {
  if (input.accessibleIds?.length === 0 || input.ids?.length === 0) {
    return Result.ok({ items: [], total: 0 });
  }
  const page = await scope.query(async (database) => {
    const projectTypeName = sql<string>`coalesce((${database.select({ name: projectTypes.name }).from(projectTypes).where(eq(projectTypes.id, projects.projectTypeId))}), '')`;
    const statusName = sql<string>`coalesce((${database.select({ name: projectStatuses.name }).from(projectStatuses).where(eq(projectStatuses.id, projects.statusId))}), '')`;
    const where = and(
      eq(projects.projectVersion, activeProjectVersion(database)),
      eq(projects.isDeleted, false),
      input.accessibleIds === undefined ? undefined : inArray(projects.id, [...input.accessibleIds]),
      input.ids === undefined ? undefined : inArray(projects.id, [...input.ids]),
      input.excludeIds?.length ? notInArray(projects.id, [...input.excludeIds]) : undefined,
      input.imported === undefined ? undefined : eq(projects.imported, input.imported),
      input.projectCutOffDate ? gte(projects.originalCreatedAt, input.projectCutOffDate) : undefined,
      input.statuses?.length ? inArray(projects.statusId,
        database.select({ id: projectStatuses.id }).from(projectStatuses)
          .where(inArray(projectStatuses.internalName, [...input.statuses]))) : undefined,
      input.projectTypeNames?.length ? inArray(projectTypeName, [...input.projectTypeNames]) : undefined,
      input.statusNames?.length ? inArray(statusName, [...input.statusNames]) : undefined,
      searchContains(projects.name, input.name),
      or(
        searchContains(projects.name, input.search),
        searchContains(projects.internalProjectNumber, input.search),
        searchContains(projectTypeName, input.search),
        searchContains(statusName, input.search),
      ),
    );
    const sort = {
      id: projects.id,
      name: sql`lower(coalesce(${projects.name}, '')) COLLATE public.project_natural_order`,
      internalProjectNumber: sql`lower(coalesce(${projects.internalProjectNumber}, '')) COLLATE public.project_natural_order`,
      projectTypeName: sql`lower(${projectTypeName}) COLLATE public.project_natural_order`,
      statusName: sql`lower(${statusName}) COLLATE public.project_natural_order`,
      originalCreatedAt: projects.originalCreatedAt,
      updatedAt: projects.updatedAt,
    }[input.sort ?? "updatedAt"];
    const direction = input.direction === "asc" ? asc : desc;
    const rows = await loadProjectRows(database, where, input.limit, input.offset, [
      direction(sort), direction(projects.id),
    ]);
    const [aggregate] = await database.select({ total: count() }).from(projects).where(where);
    return { rows, total: aggregate!.total };
  });
  const joined = await joinedRows(scope, page.rows);
  const relations = await memberships(page.rows.map(({ id }) => id));
  if (relations.isErr()) return relations;
  return Result.ok({ items: joined.map((row) => present(row, relations.value)), total: page.total });
};

export const createProject = async (scope: ProjectLogicScope, input: ProjectCreationInput) => {
  const created = await createProjectRecord(scope, input, async (project) => project);
  return created.isErr() ? created : getProject(scope, created.value.id);
};

export const updateProject = async (
  scope: ProjectLogicScope,
  projectId: string,
  input: UpdateProject,
) => {
  const projectVersions = new ProjectVersions(scope);
  const updated = await scope.transact(async () => {
    const candidateVersion = await projectVersions.latestOne(projectId);
    await projectVersions.ensureWritable(projectId, candidateVersion);
    const currentResult = await currentRow(scope, projectId);
    if (currentResult.isErr()) return Result.err(currentResult.error);
    const current = currentResult.value;
    await scope.query(async (transaction) => {
      const projectValues: Partial<typeof projects.$inferInsert> = {
        name: input.name ?? undefined,
        projectTypeId: input.projectTypeId ?? undefined,
        entryDate:
          input.entryDate === null ? undefined : projectEntryDateForStorage(input.entryDate),
        internalProjectNumber: input.internalProjectNumber ?? undefined,
        state:
          input.state === undefined
            ? undefined
            : input.state === null
              ? null
              : stateCodes[input.state],
        currentProcessStepId: input.currentProcessStepId,
      };

      const applicantValues = {
        salutation: input.salutation,
        company: input.company,
        firstName: input.firstName,
        lastName: input.lastName,
        street: input.street,
        houseNumber: input.houseNumber,
        addressSupplement: input.addressSupplement,
        plz: input.plz,
        location: input.location,
        country: input.country,
        email: input.email,
        phone: input.phone,
        fax: input.fax,
      };
      if (Object.values(applicantValues).some((value) => value !== undefined)) {
        let applicantId = current.applicantId;
        let changeType: "create" | "update" = "update";
        if (!applicantId) {
          applicantId = crypto.randomUUID();
          changeType = "create";
          await transaction.insert(applicants).values({
            id: applicantId,
            projectId,
            projectVersion: current.projectVersion,
            ...applicantValues,
          });
          projectValues.applicantId = applicantId;
        } else {
          await transaction
            .update(applicants)
            .set(applicantValues)
            .where(
              and(
                eq(applicants.id, applicantId),
                eq(applicants.projectVersion, current.projectVersion),
              ),
            );
        }
        await recordAuditEntry(transaction, {
          projectId,
          entityId: applicantId,
          entityType: "applicant",
          changeType,
        });
      }
      if (Object.values(projectValues).some((value) => value !== undefined)) {
        await transaction
          .update(projects)
          .set(projectValues)
          .where(
            and(eq(projects.id, projectId), eq(projects.projectVersion, current.projectVersion)),
          );
        await recordAuditEntry(transaction, {
          projectId,
          entityId: projectId,
          entityType: "project",
          changeType: "update",
        });
      }
    });
    return Result.ok(undefined);
  });
  if (updated.isErr()) return updated;
  return getProject(scope, projectId);
};

export const removeProject = async (
  scope: ProjectLogicScope,
  commands: import("./temporal/commands.ts").ProjectTemporalCommandsService,
  projectId: string,
) => {
  const project = await getProject(scope, projectId);
  if (project.isErr()) return project;
  await commands.deleteProject({
    projectId,
    projectVersion: project.value.projectVersion,
    workflowActor: auditActor(),
  });
  return Result.ok(project.value);
};
