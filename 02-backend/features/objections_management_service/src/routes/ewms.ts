import type { AuthPolicy } from "@spark-workflow/authentification";
import type { ProjectsService } from "@spark-workflow/core/projects/resource";
import type { FeatureHttp } from "@spark-workflow/http-host";
import { transactVersionWrite } from "@spark-workflow/node-crud";
import type { PostgresScope } from "@spark-workflow/postgres-runtime";
import { type AuditEntry, recordAuditEntries } from "@spark-workflow/audit-client/persistence";
import { Value } from "@sinclair/typebox/value";
import { better } from "better-drizzle";

import { argumentsTable, beteiligungsEingangMarkdown, beteiligungsEingaenge } from "../db/schema";
import { objectionsSchema, type ObjectionsSchema } from "../db/schema.ts";
import { objectionsErrors } from "../errors.ts";
import type { feature } from "../manifest.ts";
import type { ObjectionsService } from "../resource.ts";
import {
  type ArgumentExtractionBody,
  ArgumentExtractionBodySchema,
  type ArgumentExtractionResponse,
  ArgumentExtractionResponseSchema,
  type ClassificationBody,
  ClassificationBodySchema,
  type ClassificationFailedBody,
  ClassificationFailedBodySchema,
  type InjectionDetectedBody,
  InjectionDetectedBodySchema,
  ProcessedFileIdsResponseSchema,
  ProjectParamsSchema,
  RequiredVersionQuerySchema,
  UpdatedCountResponseSchema,
  type ExtractedArgument,
  ExtractedArgumentSchema,
} from "../schemas";
import { addSubtopics, loadTopics, type TopicProjectData } from "../topics.ts";

const createProjectPolicy = {
  permissions: [{ resource: "project", permission: "create", path: "projectId" }],
  bypassRoles: ["admin", "service"],
} satisfies AuthPolicy;
const updateProjectPolicy = {
  permissions: [{ resource: "project", permission: "update", path: "projectId" }],
  bypassRoles: ["admin", "service"],
} satisfies AuthPolicy;
const serviceOnlyPolicy = { roles: ["service"] } satisfies AuthPolicy;

const filename = (documentName: string): string => {
  const pieces = documentName.replaceAll("\\", "/").split("/");
  return pieces.at(-1) || documentName;
};

const participationType = (
  documentName: string,
): "STELLUNGNAHME" | "NATURSCHUTZ" | "EINWENDUNG" | null => {
  switch (filename(documentName)[0]) {
    case "S":
      return "STELLUNGNAHME";
    case "N":
      return "NATURSCHUTZ";
    case "E":
      return "EINWENDUNG";
    default:
      return null;
  }
};

type ArgumentRow = typeof argumentsTable.$inferSelect;
type EwmsProjectData = Pick<ProjectsService, "validateWriteVersion"> & TopicProjectData;

function unchangedExtraction(row: ArgumentRow): ExtractedArgument | null {
  const original = row.extractionPayload;
  if (original === null || !Value.Check(ExtractedArgumentSchema, original)) return null;
  const unchanged =
    row.status === "open" &&
    row.updateType !== "MANUAL" &&
    row.updatedAt.getTime() === row.createdAt.getTime() &&
    row.topicId === null &&
    row.subTopicId === null &&
    row.erwiderung === null &&
    row.einordnung === null &&
    row.isValidArgument &&
    !row.inVae &&
    row.text === original.argument.text &&
    row.startIdx === original.argument.span.startIdx &&
    row.endIdx === original.argument.span.endIdx &&
    row.context === original.context.text &&
    row.contextStartIdx === original.context.span.startIdx &&
    row.contextEndIdx === original.context.span.endIdx;
  return unchanged ? original : null;
}

async function insertArgumentExtraction(
  postgres: PostgresScope<ObjectionsSchema>,
  projects: EwmsProjectData,
  projectId: string,
  projectVersion: number,
  body: ArgumentExtractionBody,
): Promise<ArgumentExtractionResponse> {
  const reversed = body.documentArguments.find((document) =>
    document.chunkArguments.some((chunk) =>
      chunk.arguments.some(
        ({ argument, context }) =>
          argument.span.startIdx > argument.span.endIdx ||
          context.span.startIdx > context.span.endIdx,
      ),
    ),
  );
  if (reversed) {
    throw objectionsErrors.INVALID_EXTRACTION_SPAN({
      message: `Extraction span starts after it ends in document ${reversed.documentId}`,
    });
  }
  if (body.documentArguments.length === 0) return { results: [] };
  return transactVersionWrite({ postgres, projects, projectId, projectVersion }, () =>
    postgres.query(async (query) => {
      const transaction = better(query, { schema: objectionsSchema });
      const documentIds = [
        ...new Set(body.documentArguments.map(({ documentId }) => documentId)),
      ];
      const existing = await transaction.beteiligungsEingaenge.findMany({
        select: { id: true, fileId: true, classificationStatus: true },
        where: { projectId, projectVersion, isDeleted: false, fileId: { in: documentIds } },
      });
      const entryByFile = new Map(existing.map((entry) => [entry.fileId, entry]));
      const results: ArgumentExtractionResponse["results"] = [];
      const entries: (typeof beteiligungsEingaenge.$inferInsert)[] = [];
      const markdown: (typeof beteiligungsEingangMarkdown.$inferInsert)[] = [];
      const argumentsRows: (typeof argumentsTable.$inferInsert)[] = [];
      const audit: AuditEntry[] = [];
      for (const document of body.documentArguments) {
        const owned = entryByFile.get(document.documentId);
        if (owned) {
          const queued = results.find(
            (result) => result.beteiligungsEingangId === owned.id,
          );
          if (queued) {
            results.push({ ...queued, arguments: [], skipped: true });
            continue;
          }
          if (owned.classificationStatus === "done") {
            results.push({
              documentId: document.documentId,
              beteiligungsEingangId: owned.id,
              arguments: [],
              skipped: true,
            });
            continue;
          }
          const pending = await transaction.argumentsTable.findMany({
            where: { projectId, projectVersion, isDeleted: false, beteiligungsEingangId: owned.id },
            orderBy: [{ argumentId: "asc" }, { id: "asc" }],
          });
          const resumed = pending.flatMap((row) => {
            const extractedArgument = unchangedExtraction(row);
            return extractedArgument === null ? [] : [{ argumentId: row.id, extractedArgument }];
          });
          if (resumed.length === 0 || resumed.length !== pending.length) {
            throw objectionsErrors.EXTRACTION_RECOVERY_REQUIRED({
              internal: { projectId, projectVersion, beteiligungsEingangId: owned.id },
            });
          }
          results.push({
            documentId: document.documentId,
            beteiligungsEingangId: owned.id,
            arguments: resumed,
            skipped: false,
          });
          continue;
        }

        const extracted = document.chunkArguments.flatMap((chunk) => chunk.arguments);
        const entryId = crypto.randomUUID();
        const markdownId =
          document.beteiligungsEingangMarkdown === undefined ||
          document.beteiligungsEingangMarkdown === null
            ? null
            : crypto.randomUUID();
        const classificationStatus = extracted.length > 0 ? "loading" : "done";
        entryByFile.set(document.documentId, {
          id: entryId,
          fileId: document.documentId,
          classificationStatus,
        });
        entries.push({
          id: entryId,
          projectId,
          projectVersion,
          beteiligungTyp: participationType(document.documentName),
          fileId: document.documentId,
          filename: filename(document.documentName),
          markdownId,
          extractionStatus: "SUCCESS",
          classificationStatus,
        });
        audit.push({
          entityType: "beteiligungs_eingang",
          entityId: entryId,
          changeType: "create",
          actionType: "EWMS_EXTRACTION",
        });

        if (markdownId) {
          markdown.push({
            id: markdownId,
            projectId,
            projectVersion,
            beteiligungsEingangId: entryId,
            text: document.beteiligungsEingangMarkdown ?? "",
          });
        }

        const argumentResults: ArgumentExtractionResponse["results"][number]["arguments"] = [];
        for (const [index, value] of extracted.entries()) {
          const argumentId = crypto.randomUUID();
          argumentsRows.push({
            id: argumentId,
            extractionPayload: value,
            projectId,
            projectVersion,
            beteiligungsEingangId: entryId,
            subTopicId: null,
            topicId: null,
            text: value.argument.text,
            startIdx: value.argument.span.startIdx,
            endIdx: value.argument.span.endIdx,
            erwiderung: null,
            einordnung: null,
            context: value.context.text,
            contextStartIdx: value.context.span.startIdx,
            contextEndIdx: value.context.span.endIdx,
            argumentId: `A${index + 1}-${filename(document.documentName)}`,
          });
          argumentResults.push({ argumentId, extractedArgument: value });
          audit.push({
            entityType: "argument",
            entityId: argumentId,
            changeType: "create",
            actionType: "EWMS_EXTRACTION",
          });
        }

        results.push({
          documentId: document.documentId,
          beteiligungsEingangId: entryId,
          arguments: argumentResults,
          skipped: false,
        });
      }
      if (entries.length > 0)
        await transaction.beteiligungsEingaenge.createMany({ data: entries });
      if (markdown.length > 0) {
        await transaction.beteiligungsEingangMarkdown.createMany({ data: markdown });
      }
      if (argumentsRows.length > 0) {
        await transaction.argumentsTable.createMany({ data: argumentsRows });
      }
      await recordAuditEntries(query, { projectId, entries: audit });
      return { results };
    }),
  );
}

async function updateClassification(
  postgres: PostgresScope<ObjectionsSchema>,
  projects: EwmsProjectData,
  projectId: string,
  projectVersion: number,
  body: ClassificationBody,
): Promise<{ updatedCount: number }> {
  return transactVersionWrite({ postgres, projects, projectId, projectVersion }, () =>
    postgres.query(async (query) => {
      const transaction = better(query, { schema: objectionsSchema });
      const requested = await transaction.argumentsTable.findMany({
        where: {
          projectId,
          projectVersion,
          isDeleted: false,
          id: {
            in: [
              ...body.classifiedArguments.map(({ argumentId }) => argumentId),
              ...(body.unclassifiedArgumentIds ?? []),
            ],
          },
        },
        include: { beteiligungsEingang: { select: { classificationStatus: true } } },
      });
      const pending = requested.filter(
        ({ beteiligungsEingang }) => beteiligungsEingang?.classificationStatus !== "done",
      );
      if (pending.some((row) => unchangedExtraction(row) === null)) {
        throw objectionsErrors.CLASSIFICATION_CONFLICT({
          internal: { projectId, projectVersion },
        });
      }
      const eligible = new Set(pending.map(({ id }) => id));
      const classified = body.classifiedArguments.filter(({ argumentId }) =>
        eligible.has(argumentId),
      );
      const topics = await loadTopics(projects, projectId, projectVersion);
      await addSubtopics(
        projects,
        projectId,
        projectVersion,
        topics,
        classified.map(({ subTopicId }) => subTopicId ?? null),
      );
      const invalid = classified.find(({ topicId, subTopicId }) => {
        if (topics.get(topicId)?.kind !== "topic") return true;
        if (subTopicId === undefined || subTopicId === null) return false;
        const subtopic = topics.get(subTopicId);
        return subtopic?.kind !== "subtopic" || subtopic.parentTopicId !== topicId;
      });
      if (invalid) {
        throw objectionsErrors.INVALID_REFERENCE({
          internal: {
            projectId,
            projectVersion,
            argumentId: invalid.argumentId,
            topicId: invalid.topicId,
            subTopicId: invalid.subTopicId ?? null,
          },
        });
      }
      const entryIds = [
        ...new Set(pending.map(({ beteiligungsEingangId }) => beteiligungsEingangId)),
      ];
      const siblings =
        entryIds.length === 0
          ? []
          : await transaction.argumentsTable.findMany({
              select: { id: true },
              where: {
                projectId,
                projectVersion,
                isDeleted: false,
                beteiligungsEingangId: { in: entryIds },
              },
            });
      if (siblings.some(({ id }) => !eligible.has(id))) {
        throw objectionsErrors.CLASSIFICATION_CONFLICT({
          internal: { projectId, projectVersion },
        });
      }
      const updated = await transaction.argumentsTable.updateEach({
        by: argumentsTable.id,
        data: classified.map((item) => ({
          id: item.argumentId,
          topicId: item.topicId,
          subTopicId: item.subTopicId ?? null,
          topicConfidence: item.topicConfidence ?? null,
          subTopicConfidence: item.subTopicConfidence ?? null,
        })),
        update: {
          topicId: (row) => row.topicId as string,
          subTopicId: (row) => row.subTopicId as string | null,
          topicConfidence: (row) => row.topicConfidence as number | null,
          subTopicConfidence: (row) => row.subTopicConfidence as number | null,
        },
        where: { projectId, projectVersion, isDeleted: false },
      });
      const done = await transaction.beteiligungsEingaenge.updateEach({
        by: beteiligungsEingaenge.id,
        data: entryIds.map((id) => ({ id })),
        update: { classificationStatus: () => "done" },
        where: { projectId, projectVersion, isDeleted: false },
        select: { id: true },
      });
      await recordAuditEntries(query, {
        projectId,
        entries: [
          ...pending.map(({ id }) => ({
            entityType: "argument",
            entityId: id,
            changeType: "update",
          }) satisfies AuditEntry),
          ...(done.data ?? []).map(({ id }) => ({
            entityType: "beteiligungs_eingang",
            entityId: id,
            changeType: "update",
          }) satisfies AuditEntry),
        ],
      });
      return { updatedCount: updated.count };
    }),
  );
}

async function markClassificationFailed(
  postgres: PostgresScope<ObjectionsSchema>,
  projects: EwmsProjectData,
  projectId: string,
  projectVersion: number,
  body: ClassificationFailedBody,
): Promise<{ updatedCount: number }> {
  if (body.beteiligungsEingangIds.length === 0) return { updatedCount: 0 };
  return transactVersionWrite({ postgres, projects, projectId, projectVersion }, () =>
    postgres.query(async (query) => {
      const transaction = better(query, { schema: objectionsSchema });
      const failed = await transaction.beteiligungsEingaenge.updateEach({
        by: beteiligungsEingaenge.id,
        data: body.beteiligungsEingangIds.map((id) => ({ id })),
        update: { classificationStatus: () => "failed" },
        where: {
          projectId,
          projectVersion,
          isDeleted: false,
          classificationStatus: { not: "done" },
        },
        select: { id: true },
      });
      await recordAuditEntries(query, {
        projectId,
        entries: (failed.data ?? []).map(({ id }) => ({
          entityType: "beteiligungs_eingang",
          entityId: id,
          changeType: "update",
        })),
      });
      return { updatedCount: failed.count };
    }),
  );
}

async function markInjectionDetected(
  postgres: PostgresScope<ObjectionsSchema>,
  projects: EwmsProjectData,
  projectId: string,
  projectVersion: number,
  body: InjectionDetectedBody,
): Promise<{ updatedCount: number }> {
  if (body.documents.length === 0) return { updatedCount: 0 };
  return transactVersionWrite({ postgres, projects, projectId, projectVersion }, () =>
    postgres.query(async (query) => {
      const transaction = better(query, { schema: objectionsSchema });
      const existing = await transaction.beteiligungsEingaenge.findMany({
        select: { id: true, fileId: true, classificationStatus: true, markdownId: true },
        where: {
          projectId,
          projectVersion,
          isDeleted: false,
          fileId: { in: body.documents.map(({ fileId }) => fileId) },
        },
      });
      const entryByFile = new Map(existing.map((entry) => [entry.fileId, entry]));
      const inserts: (typeof beteiligungsEingaenge.$inferInsert)[] = [];
      const updateIds: string[] = [];
      const markdownIds: string[] = [];
      const audit: AuditEntry[] = [];
      let updatedCount = 0;
      for (const document of body.documents) {
        const current = entryByFile.get(document.fileId);
        if (current?.classificationStatus === "done") continue;
        if (!current) {
          const id = crypto.randomUUID();
          inserts.push({
            id,
            projectId,
            projectVersion,
            beteiligungTyp: participationType(document.documentName),
            fileId: document.fileId,
            filename: filename(document.documentName),
            markdownId: null,
            extractionStatus: "PROMPT_INJECTION_ERROR",
            classificationStatus: "done",
          });
          entryByFile.set(document.fileId, {
            id,
            fileId: document.fileId,
            classificationStatus: "done",
            markdownId: null,
          });
          audit.push({
            entityType: "beteiligungs_eingang",
            entityId: id,
            changeType: "create",
          });
        } else {
          updateIds.push(current.id);
          if (current.markdownId) markdownIds.push(current.markdownId);
          current.classificationStatus = "done";
          current.markdownId = null;
          audit.push({
            entityType: "beteiligungs_eingang",
            entityId: current.id,
            changeType: "update",
          });
        }
        updatedCount += 1;
      }
      if (inserts.length > 0) {
        await transaction.beteiligungsEingaenge.createMany({ data: inserts });
      }
      if (markdownIds.length > 0) {
        await transaction.beteiligungsEingangMarkdown.updateMany({
          data: { isDeleted: true },
          where: { projectId, projectVersion, isDeleted: false, id: { in: markdownIds } },
        });
      }
      if (updateIds.length > 0) {
        await transaction.beteiligungsEingaenge.updateMany({
          data: {
            extractionStatus: "PROMPT_INJECTION_ERROR",
            classificationStatus: "done",
            markdownId: null,
          },
          where: { projectId, projectVersion, isDeleted: false, id: { in: updateIds } },
        });
      }
      await recordAuditEntries(query, { projectId, entries: audit });
      return { updatedCount: updatedCount };
    }),
  );
}

export function createEwmsRoutes(http: FeatureHttp<typeof feature>) {
  return http
    .controller("objections-management-service.routes.ewms")
    .model({
      ArgumentExtractionResponse: ArgumentExtractionResponseSchema,
      ProcessedFileIdsResponse: ProcessedFileIdsResponseSchema,
    })
    .group("/:projectId/ewms", (app) =>
      app
        .get(
          "/processed-file-ids",
          async ({ params, objections, projectVersion }) => ({
            fileIds: await objections.listProcessedFileIds(params.projectId, projectVersion),
          }),
          {
            params: ProjectParamsSchema,
            response: ProcessedFileIdsResponseSchema,
            objections: true,
            projectVersion: true,
            detail: { operationId: "listProcessedObjectionsFileIds" },
          },
        )
        .post(
          "/argument-extraction",
          ({ params, query, body, objections }) =>
            objections.storeExtractionResults(params.projectId, query.projectVersion, body),
          {
            params: ProjectParamsSchema,
            query: RequiredVersionQuerySchema,
            body: ArgumentExtractionBodySchema,
            response: ArgumentExtractionResponseSchema,
            auth: createProjectPolicy,
            objections: true,
            detail: { operationId: "insertArgumentExtractionResults" },
          },
        )
        .patch(
          "/classification",
          ({ params, query, body, objections }) =>
            objections.storeClassificationResults(params.projectId, query.projectVersion, body),
          {
            params: ProjectParamsSchema,
            query: RequiredVersionQuerySchema,
            body: ClassificationBodySchema,
            response: UpdatedCountResponseSchema,
            auth: updateProjectPolicy,
            objections: true,
            detail: { operationId: "updateObjectionsClassificationResults" },
          },
        )
        .patch(
          "/classification-failed",
          ({ params, query, body, objections }) =>
            objections.markClassificationFailed(params.projectId, query.projectVersion, body),
          {
            params: ProjectParamsSchema,
            query: RequiredVersionQuerySchema,
            body: ClassificationFailedBodySchema,
            response: UpdatedCountResponseSchema,
            auth: serviceOnlyPolicy,
            objections: true,
            detail: { operationId: "markObjectionsClassificationFailed" },
          },
        )
        .post(
          "/injection-detected",
          ({ params, query, body, objections }) =>
            objections.markInjectionDetected(params.projectId, query.projectVersion, body),
          {
            params: ProjectParamsSchema,
            query: RequiredVersionQuerySchema,
            body: InjectionDetectedBodySchema,
            response: UpdatedCountResponseSchema,
            auth: createProjectPolicy,
            objections: true,
            detail: { operationId: "markObjectionsInjectionDetected" },
          },
        ),
    );
}

export function createObjectionsService(
  postgres: PostgresScope<typeof objectionsSchema>,
  projects: EwmsProjectData,
): ObjectionsService {
  const service: ObjectionsService = {
    async listProcessedFileIds(projectId, projectVersion) {
      const rows = await postgres.query((database) =>
        better(database, { schema: objectionsSchema }).beteiligungsEingaenge.findMany({
          select: { fileId: true },
          where: {
            projectId,
            projectVersion,
            isDeleted: false,
            classificationStatus: "done",
          },
        }),
      );
      return rows.map(({ fileId }) => fileId);
    },
    storeExtractionResults: (projectId, projectVersion, body) =>
      insertArgumentExtraction(postgres, projects, projectId, projectVersion, body),
    storeClassificationResults: (projectId, projectVersion, body) =>
      updateClassification(postgres, projects, projectId, projectVersion, body),
    markClassificationFailed: (projectId, projectVersion, body) =>
      markClassificationFailed(postgres, projects, projectId, projectVersion, body),
    markInjectionDetected: (projectId, projectVersion, body) =>
      markInjectionDetected(postgres, projects, projectId, projectVersion, body),
  };
  return Object.freeze(service);
}
