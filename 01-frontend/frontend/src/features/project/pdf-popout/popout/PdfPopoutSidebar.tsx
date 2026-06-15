import { Button } from '@/features/ui/button/Button';
import { cn } from '@/features/ui/style/cn';
import { Files, ListTree, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { PdfFileTree } from '../file-tree/PdfFileTree';
import { useSidebarPaneMapping } from '../workspace-state/useSidebarPaneMapping';
import type { DocumentFilter } from '../workspace-state/useSidebarState';
import { usePdfPopout } from '../PdfPopoutWorkspaceContext';
import { DocumentFilterTabs } from './DocumentFilterTabs';

const CollapsedSidebarStrip = () => {
  const { t } = useTranslation('PdfPopout');
  const { toggleSidebar } = usePdfPopout();

  return (
    <div className="flex w-10 shrink-0 flex-col items-center gap-2 border-r border-border-primary bg-neutral-white py-2">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        iconOnly
        onClick={toggleSidebar}
        aria-label={t('PdfPopoutSidebar.expandSidebarAria')}
      >
        <PanelLeftOpen />
      </Button>
      <ListTree className="size-4 text-slate-500" aria-hidden="true" />
      <Files className="size-4 text-slate-500" aria-hidden="true" />
    </div>
  );
};

const FILTERS: DocumentFilter[] = ['all', 'topic'];

type SidebarFileTreeContentProps = {
  isFilesError: boolean;
  tree: ReturnType<typeof usePdfPopout>['tree'];
  openDocumentIds: Set<string>;
  connectedFileId: string | undefined;
  addLaneFromSidebar: (id: string) => void;
  closeLaneByDocumentId: (id: string) => void;
  popIn: () => void;
};

const SidebarFileTreeContent = (props: SidebarFileTreeContentProps) => {
  const {
    isFilesError,
    tree,
    openDocumentIds,
    connectedFileId,
    addLaneFromSidebar,
    closeLaneByDocumentId,
    popIn,
  } = props;
  const { t } = useTranslation('PdfPopout');

  if (isFilesError) {
    return (
      <p className="px-1 py-2 text-[13px] text-red-600">
        {t('PdfPopoutSidebar.loadError')}
      </p>
    );
  }

  return (
    <PdfFileTree
      nodes={tree}
      openDocumentIds={openDocumentIds}
      connectedFileId={connectedFileId}
      onSelectDocument={addLaneFromSidebar}
      onCloseDocument={closeLaneByDocumentId}
      onPopIn={popIn}
    />
  );
};

export const PdfPopoutSidebar = () => {
  const { t } = useTranslation('PdfPopout');
  const idPrefix = useId();
  const {
    sidebarOpen,
    toggleSidebar,
    tree,
    isLoadingFiles,
    isFilesError,
    panes,
    connectedFileId,
    addLaneFromSidebar,
    closePane,
    popIn,
    documentFilter,
    setDocumentFilter,
    topicLabel,
    allDocumentCount,
    topicDocumentCount,
  } = usePdfPopout();

  const { openDocumentIds, closeLaneByDocumentId } = useSidebarPaneMapping({
    panes,
    connectedFileId,
    closePane,
  });

  if (!sidebarOpen) {
    return <CollapsedSidebarStrip />;
  }

  return (
    <aside className="flex w-[448px] shrink-0 flex-col border-r border-border-primary bg-neutral-white">
      <div className="flex items-center gap-2 border-b border-border-primary px-3 py-2">
        <span
          aria-hidden="true"
          className="shrink-0 rounded-lg bg-bg-quaternary p-2"
        >
          <Files className="size-4 text-slate-500" />
        </span>
        <p className="min-w-0 flex-1 truncate text-[13px] font-medium text-brand-950">
          {t('PdfPopoutSidebar.heading')}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          iconOnly
          onClick={toggleSidebar}
          aria-label={t('PdfPopoutSidebar.collapseSidebarAria')}
        >
          <PanelLeftClose />
        </Button>
      </div>

      {topicLabel ? (
        <>
          <DocumentFilterTabs
            idPrefix={idPrefix}
            documentFilter={documentFilter}
            onFilterChange={setDocumentFilter}
            topicLabel={topicLabel}
            allCount={allDocumentCount}
            topicCount={topicDocumentCount}
          />
          {FILTERS.map((filter) => (
            <div
              key={filter}
              role="tabpanel"
              id={`${idPrefix}-panel-${filter}`}
              aria-labelledby={`${idPrefix}-tab-${filter}`}
              hidden={documentFilter !== filter}
              className={cn(
                'min-h-0 flex-1 overflow-y-auto p-2',
                isLoadingFiles && 'animate-pulse',
              )}
            >
              <SidebarFileTreeContent
                isFilesError={isFilesError}
                tree={tree}
                openDocumentIds={openDocumentIds}
                connectedFileId={connectedFileId}
                addLaneFromSidebar={addLaneFromSidebar}
                closeLaneByDocumentId={closeLaneByDocumentId}
                popIn={popIn}
              />
            </div>
          ))}
        </>
      ) : (
        <div
          className={cn(
            'flex-1 overflow-y-auto p-2',
            isLoadingFiles && 'animate-pulse',
          )}
        >
          <SidebarFileTreeContent
            isFilesError={isFilesError}
            tree={tree}
            openDocumentIds={openDocumentIds}
            connectedFileId={connectedFileId}
            addLaneFromSidebar={addLaneFromSidebar}
            closeLaneByDocumentId={closeLaneByDocumentId}
            popIn={popIn}
          />
        </div>
      )}
    </aside>
  );
};
