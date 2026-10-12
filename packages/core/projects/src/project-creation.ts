import { recordAuditEntry } from "@spark-workflow/audit-client/persistence";
import { deleteRelationship, touchRelationship, type Relationship } from "@spark-workflow/authentification";
import { persistenceError } from "@spark-workflow/postgres-runtime";
import { Result } from "better-result";
import { and, eq } from "drizzle-orm";
import type { EvlogError } from "evlog";

import { listCatalog, topicNormKey, topicsForUsecase } from "../../usecases/src/index.ts";
import { applicants, projects, projectTypes, subtopics, topicNorms, topics } from "./db/schema.ts";
import { projectLogicModels, type ProjectLogicScope } from "./db.ts";
import { projectErrors } from "./errors.ts";
import { projectEntryDateForStorage } from "./project-row-loader.ts";
import type { CreateProject } from "./schemas.ts";

export const stateCodes = {
  Bayern: "BY",
  "Baden-Württemberg": "BW",
  Berlin: "BE",
  Brandenburg: "BB",
  Bremen: "HB",
  Hamburg: "HH",
  Hessen: "HE",
  "Mecklenburg-Vorpommern": "MV",
  Niedersachsen: "NI",
  "Nordrhein-Westfalen": "NW",
  "Rheinland-Pfalz": "RP",
  Saarland: "SL",
  Sachsen: "SN",
  "Sachsen-Anhalt": "ST",
  "Schleswig-Holstein": "SH",
  Thüringen: "TH",
};

const applicantKeys = [
  "salutation",
  "company",
  "firstName",
  "lastName",
  "street",
  "houseNumber",
  "addressSupplement",
  "plz",
  "location",
  "country",
  "email",
  "phone",
  "fax",
] satisfies (keyof ApplicantRow)[];

type ApplicantRow = typeof applicants.$inferSelect;
export type ProjectCreationInput = CreateProject & { readonly createdById: string };

export function projectCreatorId(
  user: Readonly<{ sub: string; realmRoles: readonly string[] }> | null,
  requested: string | null | undefined,
) {
  if (user === null) return requested;
  return user.realmRoles.includes("service") ? (requested ?? user.sub) : user.sub;
}

export interface CreatedProject {
  readonly id: ReturnType<typeof crypto.randomUUID>;
  readonly projectVersion: number;
}

export async function createProjectRecord<Output>(
  scope: ProjectLogicScope,
  input: ProjectCreationInput,
  withinTransaction: (project: CreatedProject) => Promise<Output>,
): Promise<Result<Output, EvlogError>> {
  const projectId = crypto.randomUUID();
  const owner = {
    resourceType: "project",
    resourceId: projectId,
    relation: "owner",
    subjectId: input.createdById,
  } satisfies Relationship;
  const { status, catalog, type, duplicate } = await scope.query(async (database) => {
    const models = projectLogicModels(database);
    const status = await models.projectStatuses.findOne({
      where: { internalName: "IN_CREATION" },
    });
    const catalog = await listCatalog(models);
    const type = await models.projectTypes.findOne({ where: { id: input.projectTypeId } });
    const duplicate = await models.projects.findOne({
      select: { id: true },
      where: { internalProjectNumber: input.internalProjectNumber, isDeleted: false },
    });
    return { status, catalog, type, duplicate };
  });
  if (!status) {
    return Result.err(projectErrors.UNAVAILABLE({ message: "Default project status not found" }));
  }
  if (catalog.isErr()) return catalog;
  const usecase = catalog.value.usecases.find(
    (candidate) => candidate.projekttyp.id === input.projectTypeId,
  );
  if (usecase === undefined) {
    return Result.err(
      projectErrors.INVALID_REQUEST({
        message: `Project type ${input.projectTypeId} not found.`,
      }),
    );
  }
  if (type?.active === false) {
    return Result.err(
      projectErrors.INVALID_REQUEST({
        message: `Project type ${input.projectTypeId} is inactive.`,
      }),
    );
  }
  const topicDefaults = topicsForUsecase(usecase, input.state ? stateCodes[input.state] : null);
  if (duplicate) {
    return Result.err(
      projectErrors.CONFLICT({
        message: `Project '${input.internalProjectNumber}' already exists`,
      }),
    );
  }

  const relationship = await touchRelationship(owner);
  if (relationship.isErr()) return relationship;

  try {
    const output = await scope.transact(async () => {
      await scope.query(async (transaction) => {
        if (type == null) {
          await transaction.insert(projectTypes).values({
            id: usecase.projekttyp.id,
            name: usecase.projekttyp.name,
          });
        }
        await transaction.insert(projects).values({
          id: projectId,
          projectVersion: 1,
          name: input.name,
          projectTypeId: input.projectTypeId,
          createdById: input.createdById,
          entryDate: projectEntryDateForStorage(input.entryDate),
          internalProjectNumber: input.internalProjectNumber,
          state:
            input.state === undefined
              ? undefined
              : input.state === null
                ? null
                : stateCodes[input.state],
          statusId: status.id,
          currentProcessStepId: null,
          imported: input.imported,
        });

        const applicantValues = Object.fromEntries(
          applicantKeys.map((key) => [key, input[key]]),
        ) as Partial<Pick<ApplicantRow, (typeof applicantKeys)[number]>>;
        if (Object.values(applicantValues).some((value) => value != null)) {
          const applicantId = crypto.randomUUID();
          await transaction.insert(applicants).values({
            id: applicantId,
            projectId,
            projectVersion: 1,
            ...applicantValues,
          });
          await transaction
            .update(projects)
            .set({ applicantId })
            .where(and(eq(projects.id, projectId), eq(projects.projectVersion, 1)));
          await recordAuditEntry(transaction, {
            projectId,
            entityId: applicantId,
            entityType: "applicant",
            changeType: "create",
          });
        }

        for (const topicDefault of topicDefaults) {
          const topicId = crypto.randomUUID();
          await transaction.insert(topics).values({
            id: topicId,
            projectId,
            projectVersion: 1,
            name: topicDefault.name,
            description: topicDefault.description,
            showInMvp: topicDefault.showInMvp ?? true,
            showInEwm: topicDefault.showInEwm ?? true,
            showInBeschluss: topicDefault.showInBeschluss ?? true,
          });
          await recordAuditEntry(transaction, {
            projectId,
            entityId: topicId,
            entityType: "topic",
            changeType: "create",
          });

          const norms = new Map<
            string,
            (typeof topicDefault.norms)[number] & { frontendParentIds: string[] }
          >();
          const addNorm = (
            norm: (typeof topicDefault.norms)[number],
            frontendParentId?: string,
          ) => {
            const key = topicNormKey(norm);
            const current = norms.get(key);
            if (current) {
              if (frontendParentId && !current.frontendParentIds.includes(frontendParentId)) {
                current.frontendParentIds.push(frontendParentId);
              }
              return;
            }
            norms.set(key, {
              ...norm,
              frontendParentIds: frontendParentId ? [frontendParentId] : [],
            });
          };
          for (const norm of topicDefault.norms) addNorm(norm);
          for (const subtopicDefault of topicDefault.subtopics) {
            const subtopicId = crypto.randomUUID();
            await transaction.insert(subtopics).values({
              id: subtopicId,
              projectId,
              projectVersion: 1,
              topicId,
              name: subtopicDefault.name,
              description: subtopicDefault.description,
              showInMvp: subtopicDefault.showInMvp,
              showInEwm: subtopicDefault.showInEwm,
              showInBeschluss: subtopicDefault.showInBeschluss,
            });
            for (const norm of subtopicDefault.norms) {
              addNorm(norm, `subtopic:${subtopicId}`);
            }
          }
          for (const norm of norms.values()) {
            await transaction.insert(topicNorms).values({
              id: crypto.randomUUID(),
              projectId,
              projectVersion: 1,
              topicId,
              jurabk: norm.jurabk,
              paragraphNr: norm.paragraphNr,
              type: norm.type,
              absatz: norm.absatz ?? null,
              satz: norm.satz ?? null,
              nummer: norm.nummer ?? null,
              frontendParentIds: norm.frontendParentIds,
            });
          }
        }

        await recordAuditEntry(transaction, {
          projectId,
          entityId: projectId,
          entityType: "project",
          changeType: "create",
        });
      });
      return withinTransaction({ id: projectId, projectVersion: 1 });
    });
    return Result.ok(output);
  } catch (cause) {
    const failure = persistenceError(cause);
    const cleanup = await deleteRelationship(owner);
    if (cleanup.isOk()) return Result.err(failure);
    return Result.err(
      projectErrors.UNAVAILABLE({
        message: "Project creation and relationship cleanup failed",
        cause: new AggregateError([failure, cleanup.error]),
      }),
    );
  }
}
