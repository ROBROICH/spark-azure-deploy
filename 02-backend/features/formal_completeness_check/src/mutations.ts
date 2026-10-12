import { recordAuditEntry } from "@spark-workflow/audit-client/persistence";
import { transactVersionWrite, type ProjectVersionPeer } from "@spark-workflow/node-crud";
import { postgresErrors, type PostgresScope } from "@spark-workflow/postgres-runtime";
import { and, eq } from "drizzle-orm";

import { categories, documents, documentTypes, formalCompletenessSchema } from "./db/schema.ts";
import { formalCompletenessErrors } from "./errors.ts";
import { CUSTOM_CATEGORY_NAME } from "./versioning.ts";

type ProjectMutation = {
  readonly postgres: PostgresScope<typeof formalCompletenessSchema>;
  readonly projects: Pick<ProjectVersionPeer, "validateWriteVersion">;
  readonly projectId: string;
  readonly projectVersion: number;
};

export async function createCustomDocumentType(
  input: ProjectMutation & { readonly documentName: string },
) {
  const { postgres, projects, projectId, projectVersion, documentName } = input;
  return await transactVersionWrite({ postgres, projects, projectId, projectVersion }, async () => {
    return postgres.query(async (transaction) => {
      const [category] = await transaction
        .select({ id: categories.id })
        .from(categories)
        .where(
          and(
            eq(categories.projectId, projectId),
            eq(categories.projectVersion, projectVersion),
            eq(categories.name, CUSTOM_CATEGORY_NAME),
            eq(categories.isDeleted, false),
          ),
        )
        .limit(1)
        .for("share");
      if (category === undefined) {
        throw formalCompletenessErrors.CUSTOM_CATEGORY_NOT_FOUND({
          internal: { projectId, projectVersion, categoryName: CUSTOM_CATEGORY_NAME },
        });
      }
      const id = crypto.randomUUID();
      const [created] = await transaction
        .insert(documentTypes)
        .values({
          id,
          projectId,
          projectVersion,
          categoryId: category.id,
          name: documentName,
          description: "",
          origin: "custom",
        })
        .returning();
      if (created === undefined) {
        throw postgresErrors.OPERATION_FAILED({
          message: "Document type creation returned no row",
          internal: { projectId, projectVersion, documentTypeId: id },
        });
      }
      await recordAuditEntry(transaction, {
        projectId,
        entityType: "document_type",
        entityId: id,
        changeType: "create",
      });
      return created;
    });
  });
}

export async function updateDocumentType(
  input: ProjectMutation & {
    readonly documentTypeId: string;
    readonly documentName?: string | null;
    readonly isResolved?: boolean | null;
  },
) {
  const {
    postgres,
    projects,
    projectId,
    projectVersion,
    documentTypeId,
    documentName,
    isResolved: requestedResolution,
  } = input;
  return await transactVersionWrite({ postgres, projects, projectId, projectVersion }, async () => {
    return postgres.query(async (transaction) => {
      const [stored] = await transaction
        .select()
        .from(documentTypes)
        .where(
          and(
            eq(documentTypes.id, documentTypeId),
            eq(documentTypes.projectId, projectId),
            eq(documentTypes.projectVersion, projectVersion),
            eq(documentTypes.isDeleted, false),
          ),
        )
        .limit(1)
        .for("update");
      if (stored === undefined) {
        throw formalCompletenessErrors.DOCUMENT_TYPE_NOT_FOUND({
          internal: { projectId, projectVersion, documentTypeId },
        });
      }
      if (documentName !== undefined && documentName !== null) {
        if (stored.origin !== "custom") {
          throw formalCompletenessErrors.SYSTEM_DOCUMENT_TYPE_FORBIDDEN({
            message: `Cannot rename a system document type (document_type_id=${documentTypeId})`,
            internal: { projectId, projectVersion, documentTypeId, operation: "rename" },
          });
        }
      }
      const name = documentName ?? stored.name;
      const isResolved = requestedResolution ?? stored.isResolved;
      const [updated] =
        name === stored.name && isResolved === stored.isResolved
          ? [stored]
          : await transaction
              .update(documentTypes)
              .set({ name, isResolved })
              .where(
                and(
                  eq(documentTypes.id, documentTypeId),
                  eq(documentTypes.projectId, projectId),
                  eq(documentTypes.projectVersion, projectVersion),
                  eq(documentTypes.isDeleted, false),
                ),
              )
              .returning();
      if (updated === undefined) {
        throw formalCompletenessErrors.DOCUMENT_TYPE_NOT_FOUND({
          internal: { projectId, projectVersion, documentTypeId },
        });
      }
      await recordAuditEntry(transaction, {
        projectId,
        entityType: "document_type",
        entityId: documentTypeId,
        changeType: "update",
      });
      return updated;
    });
  });
}

export async function deleteCustomDocumentType(
  input: ProjectMutation & { readonly documentTypeId: string },
) {
  const { postgres, projects, projectId, projectVersion, documentTypeId } = input;
  return await transactVersionWrite({ postgres, projects, projectId, projectVersion }, async () => {
    return postgres.query(async (transaction) => {
      const [stored] = await transaction
        .select({ origin: documentTypes.origin })
        .from(documentTypes)
        .where(
          and(
            eq(documentTypes.id, documentTypeId),
            eq(documentTypes.projectId, projectId),
            eq(documentTypes.projectVersion, projectVersion),
            eq(documentTypes.isDeleted, false),
          ),
        )
        .limit(1)
        .for("update");
      if (stored === undefined) {
        throw formalCompletenessErrors.DOCUMENT_TYPE_NOT_FOUND({
          internal: { projectId, projectVersion, documentTypeId },
        });
      }
      if (stored.origin !== "custom") {
        throw formalCompletenessErrors.SYSTEM_DOCUMENT_TYPE_FORBIDDEN({
          message: `Cannot delete a system document type (document_type_id=${documentTypeId})`,
          internal: { projectId, projectVersion, documentTypeId, operation: "delete" },
        });
      }
      await transaction
        .update(documents)
        .set({ aiSuggestedRequiredDocumentTypeId: null })
        .where(
          and(
            eq(documents.projectId, projectId),
            eq(documents.projectVersion, projectVersion),
            eq(documents.aiSuggestedRequiredDocumentTypeId, documentTypeId),
          ),
        );
      await transaction
        .update(documents)
        .set({ humanRequiredDocumentTypeId: null })
        .where(
          and(
            eq(documents.projectId, projectId),
            eq(documents.projectVersion, projectVersion),
            eq(documents.humanRequiredDocumentTypeId, documentTypeId),
          ),
        );
      const [deleted] = await transaction
        .update(documentTypes)
        .set({ isDeleted: true })
        .where(
          and(
            eq(documentTypes.id, documentTypeId),
            eq(documentTypes.projectId, projectId),
            eq(documentTypes.projectVersion, projectVersion),
            eq(documentTypes.origin, "custom"),
            eq(documentTypes.isDeleted, false),
          ),
        )
        .returning();
      if (deleted === undefined) {
        throw formalCompletenessErrors.DOCUMENT_TYPE_NOT_FOUND({
          internal: { projectId, projectVersion, documentTypeId },
        });
      }
      await recordAuditEntry(transaction, {
        projectId,
        entityType: "document_type",
        entityId: documentTypeId,
        changeType: "delete",
      });
      return deleted;
    });
  });
}

type DocumentTarget =
  | { readonly kind: "id"; readonly id: string }
  | { readonly kind: "fileId"; readonly fileId: string };

export async function updateDocumentAssignment(
  input: ProjectMutation & {
    readonly target: DocumentTarget;
    readonly humanRequiredDocumentTypeId?: string | null;
  },
) {
  const { postgres, projects, projectId, projectVersion, target, humanRequiredDocumentTypeId } =
    input;
  return await transactVersionWrite({ postgres, projects, projectId, projectVersion }, async () => {
    return postgres.query(async (transaction) => {
      const targetCondition =
        target.kind === "id" ? eq(documents.id, target.id) : eq(documents.fileId, target.fileId);
      const [stored] = await transaction
        .select()
        .from(documents)
        .where(
          and(
            targetCondition,
            eq(documents.projectId, projectId),
            eq(documents.projectVersion, projectVersion),
            eq(documents.isDeleted, false),
          ),
        )
        .limit(1)
        .for("update");
      if (stored === undefined) {
        throw formalCompletenessErrors.DOCUMENT_NOT_FOUND({
          internal: {
            projectId,
            projectVersion,
            ...(target.kind === "id" ? { documentId: target.id } : { fileId: target.fileId }),
          },
        });
      }
      if (humanRequiredDocumentTypeId !== undefined && humanRequiredDocumentTypeId !== null) {
        const [referencedType] = await transaction
          .select({ id: documentTypes.id })
          .from(documentTypes)
          .where(
            and(
              eq(documentTypes.id, humanRequiredDocumentTypeId),
              eq(documentTypes.projectId, projectId),
              eq(documentTypes.projectVersion, projectVersion),
              eq(documentTypes.isDeleted, false),
            ),
          )
          .limit(1)
          .for("update");
        if (referencedType === undefined) {
          throw formalCompletenessErrors.DOCUMENT_TYPE_NOT_FOUND({
            internal: {
              projectId,
              projectVersion,
              documentTypeId: humanRequiredDocumentTypeId,
            },
          });
        }
      }
      const [updated] =
        humanRequiredDocumentTypeId === undefined ||
        humanRequiredDocumentTypeId === stored.humanRequiredDocumentTypeId
          ? [stored]
          : await transaction
              .update(documents)
              .set({ humanRequiredDocumentTypeId })
              .where(
                and(
                  eq(documents.id, stored.id),
                  eq(documents.projectId, projectId),
                  eq(documents.projectVersion, projectVersion),
                  eq(documents.isDeleted, false),
                ),
              )
              .returning();
      if (updated === undefined) {
        throw formalCompletenessErrors.DOCUMENT_NOT_FOUND({
          internal: { projectId, projectVersion, documentId: stored.id },
        });
      }
      await recordAuditEntry(transaction, {
        projectId,
        entityType: "document",
        entityId: stored.id,
        changeType: "update",
      });
      return updated;
    });
  });
}
