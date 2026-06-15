/*
 * Neutral document-tree model shared across features.
 *
 * These types describe the hierarchical folder/document tree produced by
 * `buildDocumentsTree`. They were extracted from the FVP DocumentsTable feature
 * because `SingleProject/ReadOnlyDocumentsTable` and `Project/PdfPopout` also
 * build on the same shape; owning the model here keeps it independent of any
 * single rendering feature.
 */

/**
 * Canonical document-status values. Branching logic should compare against
 * these named members instead of repeating the German literals inline; lookup
 * tables keyed by status stay `satisfies Record<DocumentStatus, ...>`.
 */
export const DOCUMENT_STATUS = {
  assigned: 'Zugeordnet',
  missingType: 'Unterlagentyp fehlt',
  unassigned: 'Nicht zugeordnet',
  onRequestList: 'Auf Nachforderungsliste',
  requested: 'Nachgefordert',
  deleted: 'Gelöscht',
  resolved: 'Gelöst',
} as const;

export type DocumentStatus =
  (typeof DOCUMENT_STATUS)[keyof typeof DOCUMENT_STATUS];

export type LinkedDocumentType = {
  id: string;
  name: string;
  humanApproved: boolean;
};

export type MissingReason = {
  kind: 'required_missing';
  documentType: string;
};

export type DocumentNode = {
  kind: 'document';
  id: string;
  filename: string;
  createdAt?: string;
  status: DocumentStatus;
  linkedDocumentType?: LinkedDocumentType;
  missingReason?: MissingReason;
  isResolved?: boolean;
  isDeleted?: boolean;
  localFilePath?: string;
  children?: undefined;
};

export type FolderNode = {
  kind: 'folder';
  id: string;
  path: string;
  title: string;
  statusText?: string;
  children: TreeNode[];
};

export type TreeNode = FolderNode | DocumentNode;
