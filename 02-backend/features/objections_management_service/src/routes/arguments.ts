import type { AuthPolicy } from "@spark-workflow/authentification";
import type { ProjectsResourceService, ProjectsService } from "@spark-workflow/core/projects/resource";
import type { FeatureHttp } from "@spark-workflow/http-host";
import { transactVersionWrite } from "@spark-workflow/node-crud";
import type { PostgresScope } from "@spark-workflow/postgres-runtime";
import { recordAuditEntries } from "@spark-workflow/audit-client/persistence";
import { better, type BetterDrizzleClient } from "better-drizzle";

import { ObjectionsDocuments } from "../clients/documents.ts";
import {
  type ExportRow as CsvExportRow,
  exportFilename,
  parseImportCsv,
  serializeExportCsvStream,
} from "../csv";
import { argumentsTable, objectionsSchema, type ObjectionsSchema } from "../db/schema";
import { objectionsErrors } from "../errors";
import type { feature } from "../manifest.ts";
import { FileIdBodySchema, ImportArgumentsResponseSchema, ProjectParamsSchema } from "../schemas";
import { addSubtopics, loadTopics, type TopicReference } from "../topics.ts";

type ArgumentRow = typeof argumentsTable.$inferSelect;
type ExportProjectData = Pick<
  ProjectsResourceService,
  "resolveLatestVersion" | "listTopics" | "batchNodes" | "exportMetadata"
>;
type ImportProjectData = Pick<ProjectsService, "resolveLatestVersion" | "validateWriteVersion">;
type ExportDocumentData = Pick<ObjectionsDocuments, "listProjectFiles" | "uploadInternalFile">;
type ImportDocumentData = Pick<ObjectionsDocuments, "downloadFile" | "getFile">;

const createProjectPolicy = {
  permissions: [{ resource: "project", permission: "create", path: "projectId" }],
  bypassRoles: ["admin", "service"],
} satisfies AuthPolicy;
const exportProjectPolicy = {
  permissions: [{ resource: "project", permission: "export", path: "projectId" }],
  bypassRoles: ["admin", "service"],
} satisfies AuthPolicy;

const exportBatchSize = 1_000;

function topicNames(
  argument: ArgumentRow,
  topics: ReadonlyMap<string, TopicReference>,
): readonly [string, string] {
  const topic = argument.topicId ? topics.get(argument.topicId) : undefined;
  const subtopic = argument.subTopicId ? topics.get(argument.subTopicId) : undefined;
  return [
    topic?.kind === "topic" ? topic.name : "",
    subtopic?.kind === "subtopic" && subtopic.parentTopicId === argument.topicId
      ? subtopic.name
      : "",
  ];
}

async function* exportRowBatches(
  database: BetterDrizzleClient<ObjectionsSchema>,
  projectId: string,
  projectVersion: number,
) {
  for (let offset = 0; ; offset += exportBatchSize) {
    const batch = await database.argumentsTable.findMany({
      where: {
        projectId,
        projectVersion,
        isDeleted: false,
      },
      include: {
        beteiligungsEingang: {
          select: { fileId: true, isDeleted: true, projectId: true, projectVersion: true },
        },
      },
      orderBy: [{ argumentId: "asc" }, { id: "asc" }],
      skip: offset,
      take: exportBatchSize,
    });
    if (batch.length === 0) return;
    const active = batch.filter(
      ({ beteiligungsEingang }) =>
        beteiligungsEingang !== null &&
        !beteiligungsEingang.isDeleted &&
        beteiligungsEingang.projectId === projectId &&
        beteiligungsEingang.projectVersion === projectVersion,
    );
    if (active.length > 0) yield active;
    if (batch.length < exportBatchSize) return;
  }
}

export async function exportArguments(
  database: BetterDrizzleClient<ObjectionsSchema>,
  projects: ExportProjectData,
  documents: ExportDocumentData,
  projectId: string,
) {
  const latest = await projects.resolveLatestVersion(projectId);
  if (latest.isErr()) throw latest.error;
  const projectVersion = latest.value;

  const entries = await database.beteiligungsEingaenge.findMany({
    select: { fileId: true },
    where: { projectId, projectVersion, isDeleted: false },
  });
  const sourceFileIds = new Set(entries.map(({ fileId }) => fileId));
  const names = new Map<string, string>();
  if (sourceFileIds.size > 0) {
    for (const type of ["ewms_document", "document"] as const) {
      const files = await documents.listProjectFiles(projectId, projectVersion, type);
      for (const file of files) {
        if (sourceFileIds.has(file.id)) names.set(file.id, file.filename);
      }
      if (names.size === sourceFileIds.size) break;
    }
  }

  const topics = await loadTopics(projects, projectId, projectVersion);

  const batches = exportRowBatches(database, projectId, projectVersion);
  const content = await serializeExportCsvStream(
    (async function* () {
      for await (const batch of batches) {
        await addSubtopics(
          projects,
          projectId,
          projectVersion,
          topics,
          batch.map(({ subTopicId }) => subTopicId),
        );
        yield batch.map((argument) => {
          const [topic, subtopic] = topicNames(argument, topics);
          const fileId = argument.beteiligungsEingang?.fileId;
          if (!fileId) throw new TypeError("Active argument has no active source file");
          return {
            "Argument-ID": argument.argumentId ?? "",
            Thema: topic,
            Unterthema: subtopic,
            Argument: argument.text ?? "",
            Kontext: argument.context ?? "",
            Erwiderung: argument.erwiderung ?? "",
            Einordnung: argument.einordnung ?? "",
            Datei: names.get(fileId) ?? fileId,
          } satisfies CsvExportRow;
        });
      }
    })(),
  );

  const metadata = await projects.exportMetadata(projectId);
  if (metadata.isErr()) throw metadata.error;
  const { name } = metadata.value;
  const fileId = await documents.uploadInternalFile({
    projectId,
    fileType: "erwiderungs_export",
    filename: exportFilename(name),
    content,
  });
  return { fileId: fileId };
}

async function importArguments(
  postgres: PostgresScope<ObjectionsSchema>,
  projects: ImportProjectData,
  documents: ImportDocumentData,
  projectId: string,
  fileId: string,
): Promise<{ updated: number; skipped: number }> {
  const latest = await projects.resolveLatestVersion(projectId);
  if (latest.isErr()) throw latest.error;
  const file = await documents.getFile(fileId, latest.value);
  if (file.projectId !== projectId) {
    throw objectionsErrors.INVALID_CSV({
      message: "CSV file does not belong to this project",
      internal: { fileId, projectId, fileProjectId: file.projectId, reason: "project mismatch" },
    });
  }
  if (file.type !== "erwiderungs_import") {
    throw objectionsErrors.INVALID_CSV({
      message: "CSV file must have type 'erwiderungs_import'",
      internal: { fileId, projectId, fileType: file.type, reason: "unexpected file type" },
    });
  }
  const content = await documents.downloadFile(fileId, file.projectVersion);
  let parsed: ReturnType<typeof parseImportCsv>;
  try {
    parsed = parseImportCsv(content);
  } catch (cause) {
    throw objectionsErrors.INVALID_CSV({
      message: cause instanceof Error ? cause.message : "Invalid CSV file",
      cause: cause instanceof Error ? cause : undefined,
      internal: {
        fileId,
        projectId,
        parseFailure: cause instanceof Error ? cause.message : String(cause),
      },
    });
  }
  if (parsed.replies.size === 0) return { updated: 0, skipped: parsed.totalRows };
  return await transactVersionWrite(
    { postgres, projects, projectId, projectVersion: file.projectVersion },
    () =>
      postgres.query(async (query) => {
        const transaction = better(query, { schema: objectionsSchema });
        const rows = await transaction.argumentsTable.findMany({
          select: { id: true, argumentId: true },
          where: {
            projectId,
            projectVersion: file.projectVersion,
            isDeleted: false,
            argumentId: { in: [...parsed.replies.keys()] },
          },
        });
        if (rows.length > 0) {
          await transaction.argumentsTable.updateEach({
            by: argumentsTable.id,
            data: rows.map(({ id, argumentId }) => ({
              id,
              erwiderung: parsed.replies.get(argumentId!),
            })),
            update: { erwiderung: (row) => row.erwiderung as string },
            where: { projectId, projectVersion: file.projectVersion, isDeleted: false },
          });
          await recordAuditEntries(query, {
            projectId,
            entries: rows.map(({ id }) => ({
              entityType: "argument",
              entityId: id,
              changeType: "update",
              actionType: "ERWIDERUNG_IMPORT",
            })),
          });
        }
        return { updated: rows.length, skipped: parsed.totalRows - rows.length };
      }),
  );
}

export function createArgumentRoutes(http: FeatureHttp<typeof feature>) {
  return http
    .controller("objections-management-service.routes.arguments")
    .model({ FileIdResponse: FileIdBodySchema })
    .group("/:projectId/arguments", (app) =>
      app
        .get(
          "/export",
          ({ params, postgres, projects, documentFiles }) =>
            postgres.query((database) =>
              exportArguments(
                better(database, { schema: objectionsSchema }),
                projects,
                new ObjectionsDocuments(documentFiles),
                params.projectId,
              ),
            ),
          {
            params: ProjectParamsSchema,
            response: "FileIdResponse",
            auth: exportProjectPolicy,
            projects: true,
            documentFiles: true,
            detail: { operationId: "exportObjectionsArguments" },
          },
        )
        .post(
          "/import",
          ({ params, body, postgres, projects, documentFiles }) =>
            importArguments(
              postgres,
              projects,
              new ObjectionsDocuments(documentFiles),
              params.projectId,
              body.fileId,
            ),
          {
            params: ProjectParamsSchema,
            body: FileIdBodySchema,
            response: ImportArgumentsResponseSchema,
            auth: createProjectPolicy,
            projects: true,
            documentFiles: true,
            detail: { operationId: "importObjectionsArguments" },
          },
        ),
    );
}
