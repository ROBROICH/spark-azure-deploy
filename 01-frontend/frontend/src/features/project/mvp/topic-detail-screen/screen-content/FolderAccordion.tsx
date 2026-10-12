import type { NodePayloadByType } from '@/db/nodes/types';
import type { DocumentFileTreeFolder } from '@/features/project/data/document-file-tree/buildDocumentFileTree';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/features/ui/accordion/Accordion';
import { cn } from '@/features/ui/style/cn';
import { ChevronRight, Folder } from 'lucide-react';
import type { ReactNode } from 'react';

type FileTreeFolder = DocumentFileTreeFolder<NodePayloadByType<'dokument'>>;

type FolderAccordionProps = {
  children?: ReactNode;
  folder: FileTreeFolder;
  depth: number;
  expandedFolderIds: Record<string, boolean>;
  onToggleFolder: (folderId: string) => void;
};

export const FolderAccordion = (props: FolderAccordionProps) => {
  const { folder, children, depth, expandedFolderIds, onToggleFolder } = props;
  const isExpanded = expandedFolderIds[folder.id] ?? true;

  return (
    <Accordion
      value={isExpanded ? [folder.id] : []}
      onValueChange={(values) => {
        const shouldExpand = values.includes(folder.id);
        if (shouldExpand !== isExpanded) {
          onToggleFolder(folder.id);
        }
      }}
    >
      <AccordionItem value={folder.id}>
        <AccordionTrigger
          className="flex w-full items-center gap-2 py-1 [padding-left:calc(var(--doc-depth,0)*8px+4px)] md:[padding-left:calc(var(--doc-depth,0)*16px+4px)]"
          style={{ ['--doc-depth' as string]: depth }}
        >
          <ChevronRight
            className={cn(
              'size-4 shrink-0 transition-transform duration-200',
              isExpanded && 'rotate-90',
            )}
            aria-hidden="true"
          />
          <Folder
            className="hidden size-4 shrink-0 text-text-secondary md:block"
            aria-hidden="true"
          />
          <span className="flex-1 truncate text-left text-[13px] text-text-secondary">
            {folder.name}
          </span>
        </AccordionTrigger>
        {isExpanded && folder.children.length > 0 ? (
          <AccordionContent>{children}</AccordionContent>
        ) : null}
      </AccordionItem>
    </Accordion>
  );
};
