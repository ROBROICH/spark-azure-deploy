import { createContext, useContext, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/features/ui/accordion/Accordion';
import { cn } from '@/features/ui/style/cn';
import { ChevronDown, Clock, File, Folder, Minimize2, X } from 'lucide-react';
import type { PdfTreeNode } from '../pdfPopout.logic';
import type { RecentDocument } from '../workspace-state/useRecentDocuments';

type PdfFileTreeTheme = 'light' | 'dark';

const TREE_THEME_TOKENS = {
  light: {
    sectionIcon: 'text-slate-400',
    muted: 'text-slate-500',
    divider: 'border-border-primary',
    itemSelected: 'selected-ring bg-slate-100 text-brand-950',
    itemHighlighted: 'bg-slate-100 text-brand-950',
    itemDefault: 'text-brand-950 hover:bg-bg-secondary',
    connectedBadge: 'border-slate-400 bg-neutral-white text-slate-600',
    closeButton: 'text-slate-600 hover:bg-slate-200',
    folderRow: 'text-slate-600 hover:bg-bg-secondary',
  },
  dark: {
    sectionIcon: 'text-neutral-500',
    muted: 'text-neutral-400',
    divider: 'border-neutral-600',
    itemSelected: 'selected-ring-invert bg-neutral-600 text-neutral-white',
    itemHighlighted: 'bg-neutral-700 text-neutral-white',
    itemDefault: 'text-neutral-300 hover:bg-neutral-700',
    connectedBadge: 'border-neutral-500 text-neutral-300',
    closeButton: 'text-neutral-400 hover:bg-neutral-600 hover:text-neutral-200',
    folderRow: 'text-neutral-400 hover:bg-neutral-700',
  },
} as const satisfies Record<PdfFileTreeTheme, Record<string, string>>;

type PdfFileTreeProps = {
  nodes: PdfTreeNode[];
  selectedDocumentId?: string;
  recentDocuments?: RecentDocument[];
  onSelectDocument: (documentId: string) => void;
  onCloseDocument?: (documentId: string) => void;
  onPopIn?: () => void;
  openDocumentIds?: Set<string>;
  connectedFileId?: string;
  theme?: PdfFileTreeTheme;
};

const collectTopLevelFolderIds = (nodes: PdfTreeNode[]) =>
  nodes.filter((node) => node.kind === 'folder').map((node) => node.id);

type TreeContext = {
  expandedIds: string[];
  selectedDocumentId?: string;
  onSelectDocument: (documentId: string) => void;
  onCloseDocument?: (documentId: string) => void;
  onPopIn?: () => void;
  openDocumentIds?: Set<string>;
  connectedFileId?: string;
  tokens: (typeof TREE_THEME_TOKENS)[PdfFileTreeTheme];
};

// Narrow exception to the logic-hook context pattern: this context owns no feature state, navigation, or mutations — it only forwards stable props to eliminate recursive drilling through the tree.
const TreeNodeContext = createContext<TreeContext | null>(null);

const useTreeNodeContext = () => {
  const context = useContext(TreeNodeContext);
  if (!context) {
    throw new Error('useTreeNodeContext must be used within PdfFileTree');
  }
  return context;
};

const PdfFileTreeAccordion = (props: PdfFileTreeProps) => {
  const {
    nodes,
    selectedDocumentId,
    recentDocuments,
    onSelectDocument,
    onCloseDocument,
    onPopIn,
    openDocumentIds,
    connectedFileId,
    theme = 'light',
  } = props;
  const { t } = useTranslation('PdfPopout');
  const tokens = TREE_THEME_TOKENS[theme];
  const initialExpandedIds = collectTopLevelFolderIds(nodes);
  // eslint-disable-next-line no-restricted-syntax -- expansion state is ephemeral UI state that does not belong in URL params
  const [expandedIds, setExpandedIds] = useState<string[]>(initialExpandedIds);
  const hasRecentDocuments =
    recentDocuments !== undefined && recentDocuments.length > 0;

  // eslint-disable-next-line no-restricted-syntax -- context provider value must keep stable identity to avoid re-rendering every recursive TreeNodeItem consumer
  const treeContext = useMemo(
    () => ({
      expandedIds,
      selectedDocumentId,
      onSelectDocument,
      onCloseDocument,
      onPopIn,
      openDocumentIds,
      connectedFileId,
      tokens,
    }),
    [
      expandedIds,
      selectedDocumentId,
      onSelectDocument,
      onCloseDocument,
      onPopIn,
      openDocumentIds,
      connectedFileId,
      tokens,
    ],
  );

  return (
    <TreeNodeContext.Provider value={treeContext}>
      <div className="flex flex-col gap-2">
        {hasRecentDocuments && (
          <>
            <div className="flex items-center gap-1.5 px-2 py-1">
              <Clock className={cn('size-3', tokens.sectionIcon)} />
              <span
                className={cn(
                  'text-[11px] leading-[14px] font-medium',
                  tokens.muted,
                )}
              >
                {t('PdfFileTree.recentlyOpened')}
              </span>
            </div>
            {recentDocuments.map((entry) => (
              <button
                key={entry.documentId}
                type="button"
                onClick={() => onSelectDocument(entry.documentId)}
                className={cn(
                  'focus-ring flex h-8 w-full items-center gap-2 rounded-lg px-1 text-left text-[13px] leading-[18px] transition-colors',
                  selectedDocumentId === entry.documentId
                    ? cn('font-medium', tokens.itemSelected)
                    : cn('font-normal', tokens.itemDefault),
                  'pl-[26px]',
                )}
              >
                <File
                  aria-hidden="true"
                  className={cn('size-4 shrink-0', tokens.muted)}
                />
                <span className="min-w-0 flex-1 truncate">{entry.title}</span>
              </button>
            ))}
            <div className={cn('mx-2 my-1 border-t', tokens.divider)} />
          </>
        )}
        <Accordion
          type="multiple"
          value={expandedIds}
          onValueChange={setExpandedIds}
          className="flex flex-col gap-2"
        >
          {nodes.map((node) => (
            <TreeNodeItem key={node.id} node={node} />
          ))}
        </Accordion>
      </div>
    </TreeNodeContext.Provider>
  );
};

/**
 * Renders a single tree node — either a document button with
 * selection/connected/open-in-lane indicators, or an Accordion-based
 * collapsible folder whose children are rendered recursively.
 *
 * @param props The tree node to render. All other state is read from TreeNodeContext.
 * @returns A document row or a collapsible folder with recursive children.
 */
function TreeNodeItem(props: { node: PdfTreeNode }) {
  const { node } = props;
  const {
    expandedIds,
    selectedDocumentId,
    onSelectDocument,
    onCloseDocument,
    onPopIn,
    openDocumentIds,
    connectedFileId,
    tokens,
  } = useTreeNodeContext();
  const { t } = useTranslation('PdfPopout');

  if (node.kind === 'document') {
    const isSelected = selectedDocumentId === node.id;
    const isConnected = connectedFileId === node.id;
    const isOpenInLane =
      !isConnected && (openDocumentIds?.has(node.id) ?? false);
    const isHighlighted = isConnected || isOpenInLane;

    return (
      <div
        className={cn(
          'flex h-8 w-full items-center gap-2 rounded-lg px-1 text-left text-[13px] leading-[18px] transition-colors',
          isHighlighted || isSelected ? 'font-medium' : 'font-normal',
          isSelected
            ? tokens.itemSelected
            : isHighlighted
              ? tokens.itemHighlighted
              : tokens.itemDefault,
        )}
      >
        <button
          type="button"
          onClick={() => onSelectDocument(node.id)}
          className="focus-ring flex min-w-0 flex-1 items-center gap-2 rounded-md text-left"
          aria-label={node.title}
        >
          <File
            aria-hidden="true"
            className={cn('size-4 shrink-0', tokens.muted)}
          />
          <span className="min-w-0 flex-1 truncate">{node.title}</span>
        </button>
        {isConnected && (
          <div className="flex shrink-0 items-center gap-1">
            <span
              className={cn(
                'shrink-0 rounded border-[0.5px] px-2 py-[5px] text-[11px] leading-[14px] font-medium tracking-[0.02em]',
                tokens.connectedBadge,
              )}
            >
              {t('PdfFileTree.connectedBadge')}
            </span>
            {onPopIn && (
              <button
                type="button"
                className={cn(
                  'focus-ring shrink-0 rounded p-1 transition-colors',
                  tokens.closeButton,
                )}
                onClick={onPopIn}
                aria-label={t('PdfFileTree.popInAria')}
              >
                <Minimize2 className="size-4" strokeWidth={1.25} />
              </button>
            )}
          </div>
        )}
        {isOpenInLane && onCloseDocument && (
          <button
            type="button"
            className={cn(
              'focus-ring shrink-0 rounded p-1 transition-colors',
              tokens.closeButton,
            )}
            onClick={() => onCloseDocument(node.id)}
            aria-label={t('PdfFileTree.closeLaneAria')}
          >
            <X className="size-4" strokeWidth={1.25} />
          </button>
        )}
      </div>
    );
  }

  return (
    <AccordionItem value={node.id}>
      <AccordionTrigger
        className={cn(
          'flex h-8 w-full items-center gap-2 rounded-lg px-1 text-left text-[13px] leading-[18px] font-normal transition-colors',
          tokens.folderRow,
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            'inline-flex shrink-0 transition-transform duration-200',
            expandedIds.includes(node.id) ? 'rotate-0' : '-rotate-90',
            tokens.muted,
          )}
        >
          <ChevronDown className="size-4" strokeWidth={1.25} />
        </span>
        <Folder
          aria-hidden="true"
          className={cn('size-4 shrink-0', tokens.muted)}
        />
        <span className="min-w-0 flex-1 truncate">{node.title}</span>
      </AccordionTrigger>
      <AccordionContent className="flex flex-col gap-2 pt-2 pl-4">
        {node.children.map((child) => (
          <TreeNodeItem key={child.id} node={child} />
        ))}
      </AccordionContent>
    </AccordionItem>
  );
}

/**
 * Renders an expandable file tree using Radix Accordion with optional
 * recent-documents section, selection highlight, connected/open-in-lane
 * indicators, and light/dark theme support for use in both the sidebar
 * and the dark dropdown.
 */
export const PdfFileTree = (props: PdfFileTreeProps) => {
  const treeStateKey = collectTopLevelFolderIds(props.nodes).join('|');

  return <PdfFileTreeAccordion key={treeStateKey} {...props} />;
};
