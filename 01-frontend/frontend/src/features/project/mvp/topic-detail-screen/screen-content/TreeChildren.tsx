import type { NodePayloadByType } from '@/db/nodes/types';
import type { DocumentFileTreeNode } from '@/features/project/data/document-file-tree/buildDocumentFileTree';
import { DocumentItem } from './DocumentItem';
import { FolderAccordion } from './FolderAccordion';

type FileTreeNode = DocumentFileTreeNode<NodePayloadByType<'dokument'>>;

type TreeChildrenProps = {
  canMutateTopic: boolean;
  items: FileTreeNode[];
  depth: number;
  expandedFolderIds: Record<string, boolean>;
  isDocumentReviewed: (documentId: string) => boolean;
  onToggleDocumentReviewed: (documentId: string) => void;
  onToggleFolder: (folderId: string) => void;
  onSelectDocument: (documentId: string) => void;
  selectedDocumentId: string | null;
  selectedNormId?: string;
};

const isDokumentNode = (
  item: FileTreeNode,
): item is NodePayloadByType<'dokument'> => {
  return !('children' in item);
};

export function TreeChildren(props: TreeChildrenProps) {
  const {
    items,
    depth,
    expandedFolderIds,
    isDocumentReviewed,
    onToggleDocumentReviewed,
    onToggleFolder,
    onSelectDocument,
    selectedDocumentId,
    selectedNormId,
    canMutateTopic,
  } = props;

  return (
    <div className="flex flex-col gap-2">
      {items.map((item) =>
        isDokumentNode(item) ? (
          <DocumentItem
            key={item.id}
            document={item}
            depth={depth}
            isSelected={selectedDocumentId === item.id}
            isReviewed={isDocumentReviewed(item.id)}
            onSelectDocument={onSelectDocument}
            onToggleReviewed={onToggleDocumentReviewed}
            selectedNormId={selectedNormId}
            canMutateTopic={canMutateTopic}
          />
        ) : (
          <FolderAccordion
            key={item.id}
            folder={item}
            depth={depth}
            expandedFolderIds={expandedFolderIds}
            onToggleFolder={onToggleFolder}
          >
            <TreeChildren
              items={item.children}
              depth={depth + 1}
              expandedFolderIds={expandedFolderIds}
              isDocumentReviewed={isDocumentReviewed}
              onToggleDocumentReviewed={onToggleDocumentReviewed}
              onToggleFolder={onToggleFolder}
              onSelectDocument={onSelectDocument}
              selectedDocumentId={selectedDocumentId}
              selectedNormId={selectedNormId}
              canMutateTopic={canMutateTopic}
            />
          </FolderAccordion>
        ),
      )}
    </div>
  );
}
