import type { TFunction } from 'i18next';
import type { DocumentStatus } from '@/features/project/data/document-tree/documentTree.types';
import type { RowNode } from '@/features/project/data/document-tree/documentTreeTable';
import type { RequiredDocumentNode } from '../../data/schemas/requiredDocument.schema';

export type { RowNode };

export type ColumnCallbacks = {
  activeDocumentId?: string;
  canMutateProject: boolean;
  onFileClick: (documentId: string) => void;
  onConfirmDocumentType: (documentId: string) => void;
  onSelectDocumentType: (documentId: string, documentType: string) => void;
  onManageCustomDocumentTypes: () => void;
  onRequestDocument: (
    title: string,
    documentId: string,
    source?: 'tableOfContents' | 'requiredDocuments',
  ) => void;
  onAddComment: (title: string) => void;
  t: TFunction<'FormalCompletenessCheck'>;
  availableDocumentTypesStructured: RequiredDocumentNode[];
};

export const documentStatusTranslationKey = {
  Zugeordnet: 'DocumentsCard.toolbar.statusFilter.assigned',
  'Unterlagentyp fehlt': 'DocumentsCard.toolbar.statusFilter.missingType',
  'Nicht zugeordnet': 'DocumentsCard.toolbar.statusFilter.unassigned',
  'Auf Nachforderungsliste': 'DocumentsCard.toolbar.statusFilter.onRequestList',
  Nachgefordert: 'RequiredDocumentsCard.missingDocuments.status.requested',
  Gelöscht: 'DocumentsCard.toolbar.statusFilter.deleted',
  Gelöst: 'DocumentsCard.toolbar.statusFilter.resolved',
} as const satisfies Record<DocumentStatus, string>;
