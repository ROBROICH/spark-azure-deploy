import { createHash } from "node:crypto";
import { recordAuditEntry } from "@spark-workflow/audit-client/persistence";
import type { Static } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import { loadResultFile } from "@spark-workflow/core/documents/data";
import type { DocumentsService } from "@spark-workflow/core/documents/resource";
import { files } from "@spark-workflow/core/documents/schema";
import { transactVersionWrite, type ProjectVersionPeer } from "@spark-workflow/node-crud";
import type { PostgresScope } from "@spark-workflow/postgres-runtime";
import { LLMMatchingOutput } from "@spark-temporal/contracts";
import { better } from "better-drizzle";
import { and, asc, eq, inArray, isNotNull, notInArray, sql } from "drizzle-orm";

import {
  categories,
  documents,
  documentTypes,
  formalCompletenessSchema,
  resultReceipts,
  tocNotes,
  tocStatuses,
} from "./db/schema.ts";
import { JobDoneResponseSchema, TocJobDoneResponseSchema, TocResultSchema } from "./schemas.ts";

export async function processFormalResults(
  postgres: PostgresScope<typeof formalCompletenessSchema>,
  documentManagement: Pick<DocumentsService, "readResultFile">,
  projects: Pick<ProjectVersionPeer, "validateWriteVersion">,
  projectId: string,
  projectVersion: number | undefined,
  fileId: string,
): Promise<Static<typeof JobDoneResponseSchema>> {
  const file = await loadResultFile(
    documentManagement,
    LLMMatchingOutput,
    fileId,
    projectId,
    projectVersion,
  );
  if (file.isErr()) throw file.error;
  const result = file.value.payload;
  const categoryNames = new Set<string>();
  let assignedDocuments = 0;
  for (const matched of result.matchedDocumentTypes) {
    if (matched.assignedDocuments.length > 0 && matched.requiredDocumentType.category != null) {
      categoryNames.add(matched.requiredDocumentType.category);
    }
    assignedDocuments += matched.assignedDocuments.length;
  }
  const outcome = {
    status:
      result.matchedDocumentTypes.length === 0 && result.unassignedDocuments.length === 0
        ? "no_results"
        : "results_processed",
    matchedDocumentTypes: result.matchedDocumentTypes.length,
    assignedDocuments,
    unassignedDocuments: result.unassignedDocuments.length,
    previousRecordsDeleted: 0,
  } satisfies Static<typeof JobDoneResponseSchema>;
  const receiptKey = {
    projectId,
    projectVersion: file.value.projectVersion,
    kind: "formal",
    fileId,
    digest: file.value.digest,
  } satisfies Omit<typeof resultReceipts.$inferInsert, "outcome">;
  return transactVersionWrite(
    { postgres, projects, projectId, projectVersion: file.value.projectVersion },
    async () => {
      return postgres.query(async (query) => {
        const transaction = better(query, { schema: formalCompletenessSchema });
        const receipt = await transaction.resultReceipts.findUnique({ where: receiptKey });
        if (receipt !== null) return Value.Parse(JobDoneResponseSchema, receipt.outcome);
        const storedCategories = await transaction.categories.findMany({
          select: { id: true, name: true },
          where: { projectId, projectVersion: file.value.projectVersion, isDeleted: false },
        });
        const categoryIds = new Map(storedCategories.map(({ id, name }) => [name, id]));
        const newCategories: (typeof categories.$inferInsert)[] = [];
        for (const name of categoryNames) {
          if (categoryIds.has(name)) continue;
          const id = crypto.randomUUID();
          categoryIds.set(name, id);
          newCategories.push({ id, projectId, projectVersion: file.value.projectVersion, name });
        }
        if (newCategories.length > 0)
          await transaction.categories.createMany({ data: newCategories });
        const storedTypes = await transaction.documentTypes.findMany({
          select: { id: true, name: true },
          where: { projectId, projectVersion: file.value.projectVersion, isDeleted: false },
        });
        const documentTypeIds = new Map(storedTypes.map(({ id, name }) => [name, id]));
        const newDocumentTypes = new Map<string, typeof documentTypes.$inferInsert>();
        const updatedDocumentTypes = new Map<
          string,
          { id: string; categoryId: string | null; description: string; confidence: number }
        >();
        const documentValues: (typeof documents.$inferInsert)[] = [];
        for (const matched of result.matchedDocumentTypes) {
          if (matched.assignedDocuments.length === 0) continue;
          const name = matched.requiredDocumentType.documentTypeName;
          const categoryName = matched.requiredDocumentType.category;
          const categoryId = categoryName == null ? null : categoryIds.get(categoryName)!;
          let documentTypeId = documentTypeIds.get(name);
          if (documentTypeId === undefined) {
            documentTypeId = crypto.randomUUID();
            documentTypeIds.set(name, documentTypeId);
            newDocumentTypes.set(name, {
              id: documentTypeId,
              projectId,
              projectVersion: file.value.projectVersion,
              categoryId,
              name,
              description: matched.requiredDocumentType.documentTypeDescription,
              confidence: matched.confidence,
              origin: "system",
            });
          } else if (newDocumentTypes.has(name)) {
            newDocumentTypes.set(name, {
              ...newDocumentTypes.get(name)!,
              categoryId,
              description: matched.requiredDocumentType.documentTypeDescription,
              confidence: matched.confidence,
            });
          } else {
            updatedDocumentTypes.set(documentTypeId, {
              id: documentTypeId,
              categoryId,
              description: matched.requiredDocumentType.documentTypeDescription,
              confidence: matched.confidence,
            });
          }
          for (const document of matched.assignedDocuments) {
            documentValues.push({
              id: crypto.randomUUID(),
              projectId,
              projectVersion: file.value.projectVersion,
              fileId: document.documentId,
              contentExtractionId: document.documentExtractionId,
              aiSuggestedRequiredDocumentTypeId: documentTypeId,
              documentName: document.documentName,
              reasoning: document.reasoning,
              confidence: document.confidence,
            });
          }
        }
        if (newDocumentTypes.size > 0) {
          await transaction.documentTypes.createMany({ data: [...newDocumentTypes.values()] });
        }
        if (updatedDocumentTypes.size > 0) {
          await transaction.documentTypes.updateEach({
            by: documentTypes.id,
            data: [...updatedDocumentTypes.values()],
            update: {
              categoryId: (row) => row.categoryId as string | null,
              description: (row) => row.description as string,
              confidence: (row) => row.confidence as number,
            },
            where: { projectId, projectVersion: file.value.projectVersion, origin: "system" },
          });
        }
        for (const document of result.unassignedDocuments) {
          documentValues.push({
            id: crypto.randomUUID(),
            projectId,
            projectVersion: file.value.projectVersion,
            fileId: document.documentId,
            contentExtractionId: document.documentExtractionId,
            aiSuggestedRequiredDocumentTypeId: null,
            documentName: document.documentName,
            reasoning: document.reasoning,
            confidence: document.confidence,
          });
        }
        if (documentValues.length > 0) {
          await query
            .insert(documents)
            .values(documentValues)
            .onConflictDoUpdate({
              target: [documents.projectId, documents.projectVersion, documents.fileId],
              targetWhere: sql`${documents.fileId} IS NOT NULL`,
              set: {
                contentExtractionId: sql`excluded.content_extraction_id`,
                aiSuggestedRequiredDocumentTypeId: sql`excluded.ai_suggested_required_document_type_id`,
                documentName: sql`excluded.document_name`,
                reasoning: sql`excluded.reasoning`,
                confidence: sql`excluded.confidence`,
              },
            });
        }
        await transaction.resultReceipts.create({ data: { ...receiptKey, outcome } });
        await recordAuditEntry(query, {
          projectId,
          entityType: "project",
          entityId: projectId,
          changeType: "action",
          actionType: "formal_completeness_results_processed",
        });
        return outcome;
      });
    },
  );
}

export async function getFormalResults(
  postgres: PostgresScope<typeof formalCompletenessSchema>,
  projectId: string,
  projectVersion: number,
) {
  const [typeRows, documentRows] = await postgres.query(async (database) => {
    const storedTypes = await database
      .select({
        id: documentTypes.id,
        name: documentTypes.name,
        description: documentTypes.description,
        confidence: documentTypes.confidence,
        category: categories.name,
      })
      .from(documentTypes)
      .leftJoin(
        categories,
        and(
          eq(categories.id, documentTypes.categoryId),
          eq(categories.projectId, documentTypes.projectId),
          eq(categories.projectVersion, documentTypes.projectVersion),
          eq(categories.isDeleted, false),
        ),
      )
      .where(
        and(
          eq(documentTypes.projectId, projectId),
          eq(documentTypes.projectVersion, projectVersion),
          eq(documentTypes.isDeleted, false),
        ),
      )
      .orderBy(asc(documentTypes.createdAt), asc(documentTypes.id));
    const storedDocuments = await database
      .select({
        documentId: documents.fileId,
        documentName: documents.documentName,
        reasoning: documents.reasoning,
        confidence: documents.confidence,
        aiSuggestedRequiredDocumentTypeId: documents.aiSuggestedRequiredDocumentTypeId,
        humanRequiredDocumentTypeId: documents.humanRequiredDocumentTypeId,
        contentExtractionId: documents.contentExtractionId,
      })
      .from(documents)
      .innerJoin(
        files,
        and(
          eq(files.id, documents.fileId),
          eq(files.projectId, documents.projectId),
          eq(files.projectVersion, documents.projectVersion),
          eq(files.isDeleted, false),
          eq(files.type, "DOCUMENT"),
        ),
      )
      .where(
        and(
          eq(documents.projectId, projectId),
          eq(documents.projectVersion, projectVersion),
          eq(documents.isDeleted, false),
        ),
      )
      .orderBy(asc(documents.createdAt), asc(documents.id));
    return [storedTypes, storedDocuments];
  });
  type DocumentResponse = {
    documentId: string;
    documentName: string;
    reasoning: string;
    confidence: number;
    aiSuggestedRequiredDocumentTypeId: string | null;
    humanRequiredDocumentTypeId: string | null;
    contentExtractionId: string | null;
  };
  const assigned = new Map<string, DocumentResponse[]>();
  const unassignedDocuments: DocumentResponse[] = [];
  for (const document of documentRows) {
    if (document.documentId === null) continue;
    const response = {
      ...document,
      documentId: document.documentId,
      reasoning: document.reasoning ?? "",
      confidence: document.confidence ?? 0,
    };
    const typeId = document.aiSuggestedRequiredDocumentTypeId;
    if (typeId === null) unassignedDocuments.push(response);
    else assigned.set(typeId, [...(assigned.get(typeId) ?? []), response]);
  }
  return {
    matchedDocumentTypes: typeRows.map((documentType) => ({
      requiredDocumentType: {
        category: documentType.category,
        documentTypeName: documentType.name,
        documentTypeDescription: documentType.description,
      },
      assignedDocuments: assigned.get(documentType.id) ?? [],
      confidence: documentType.confidence ?? 0,
    })),
    unassignedDocuments,
  };
}

export async function processTocResults(
  postgres: PostgresScope<typeof formalCompletenessSchema>,
  documentManagement: Pick<DocumentsService, "readResultFile">,
  projects: Pick<ProjectVersionPeer, "validateWriteVersion">,
  projectId: string,
  projectVersion: number | undefined,
  fileId: string,
): Promise<Static<typeof TocJobDoneResponseSchema>> {
  const file = await loadResultFile(
    documentManagement,
    TocResultSchema,
    fileId,
    projectId,
    projectVersion,
  );
  if (file.isErr()) throw file.error;
  const result = file.value.payload;
  const extraction = result.inhaltsverzeichnisExtractionOutput;
  const found = extraction.status === "success";
  const matches = found ? result.inhaltsverzeichnisMatchingOutput.matchedDocumentTypes : [];
  const unmatched = matches
    .filter((match) => match.assignedDocuments.length === 0)
    .map((match) => match.requiredDocumentType.documentTypeName);
  const generatedNotes = [...new Set(unmatched)].map((content) => ({
    id: crypto.randomUUID(),
    projectId,
    projectVersion: file.value.projectVersion,
    content,
    generatedKey: createHash("sha256").update(content).digest("hex"),
  }));
  const generatedKeys = generatedNotes.map(({ generatedKey }) => generatedKey);
  const receiptKey = {
    projectId,
    projectVersion: file.value.projectVersion,
    kind: "toc",
    fileId,
    digest: file.value.digest,
  } satisfies Omit<typeof resultReceipts.$inferInsert, "outcome">;
  return transactVersionWrite(
    { postgres, projects, projectId, projectVersion: file.value.projectVersion },
    async () => {
      return postgres.query(async (query) => {
        const transaction = better(query, { schema: formalCompletenessSchema });
        const receipt = await transaction.resultReceipts.findUnique({ where: receiptKey });
        if (receipt !== null) return Value.Parse(TocJobDoneResponseSchema, receipt.outcome);
        const activeGeneratedNotes = and(
          eq(tocNotes.projectId, projectId),
          eq(tocNotes.projectVersion, file.value.projectVersion),
          eq(tocNotes.isDeleted, false),
          isNotNull(tocNotes.generatedKey),
        );
        await query
          .update(tocNotes)
          .set({ isOutdated: true })
          .where(
            and(
              activeGeneratedNotes,
              eq(tocNotes.isOutdated, false),
              generatedKeys.length > 0 ? notInArray(tocNotes.generatedKey, generatedKeys) : undefined,
            ),
          );
        let notesCreated = 0;
        if (generatedNotes.length > 0) {
          await query
            .update(tocNotes)
            .set({ isOutdated: false })
            .where(
              and(
                activeGeneratedNotes,
                eq(tocNotes.isOutdated, true),
                inArray(tocNotes.generatedKey, generatedKeys),
              ),
            );
          const inserted = await query
            .insert(tocNotes)
            .values(generatedNotes)
            .onConflictDoNothing({
              target: [tocNotes.projectId, tocNotes.projectVersion, tocNotes.generatedKey],
              where: sql`${tocNotes.generatedKey} IS NOT NULL`,
            })
            .returning({ id: tocNotes.id });
          notesCreated = inserted.length;
        }
        await query
          .insert(tocStatuses)
          .values({
            id: crypto.randomUUID(),
            projectId,
            projectVersion: file.value.projectVersion,
            status: extraction.status,
          })
          .onConflictDoUpdate({
            target: [tocStatuses.projectId, tocStatuses.projectVersion],
            targetWhere: sql`${tocStatuses.isDeleted} IS false`,
            set: { status: extraction.status },
          });
        const outcome = {
          status: extraction.status,
          notesCreated,
          matchedDocumentTypesTotal: matches.length,
          unmatchedDocumentTypes: unmatched,
          tocDocumentId: found ? (extraction.metadata?.documentId ?? null) : null,
        } satisfies Static<typeof TocJobDoneResponseSchema>;
        await transaction.resultReceipts.create({ data: { ...receiptKey, outcome } });
        await recordAuditEntry(query, {
          projectId,
          entityType: "project",
          entityId: projectId,
          changeType: "action",
          actionType: "formal_completeness_toc_results_processed",
        });
        return outcome;
      });
    },
  );
}
