import type { NodePayloadByType } from '@/db/nodes/types';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/features/ui/accordion/Accordion';
import { buildDocumentFileTree } from '@/features/project/data/document-file-tree/buildDocumentFileTree';
import { StatusBadge } from '@/features/ui/status-badge/StatusBadge';
import { TooltipWrapper } from '@/features/ui/tooltip/TooltipWrapper';
import { useLiveNode } from '@/db/nodes/hooks/useLiveNodes';
import { cn } from '@/features/ui/style/cn';
import { getRouteApi } from '@tanstack/react-router';
import { ChevronRight, Folder } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MvpSelectionLabelsProvider } from '../screen-content/MvpSelectionLabelsContext';
import { getNormReferenceLabel } from '../screen-content/fundstellenLabels';
import { useTopicDocumentChecklist } from '../screen-data/useTopicDocumentChecklist';
import { TreeChildren } from '../screen-content/TreeChildren';

const route = getRouteApi('/verfahren/$verfahrenId/mvp/$topicName/');

type DocumentsSwimlaneProps = {
  canMutateTopic: boolean;
  topicDocuments: NodePayloadByType<'dokument'>[];
};

/**
 * Owns the selected-topic document tree once at the lane boundary so the
 * route-backed preview state and the rendered file tree stay in sync without
 * re-querying descendants deeper in the subtree.
 */
export const DocumentsSwimlane = (props: DocumentsSwimlaneProps) => {
  const { verfahrenId, topicName } = route.useParams();
  const { selectedDocumentId, selectedNormId } = route.useSearch({
    select: (search) => ({
      selectedDocumentId: search.selectedDocumentId,
      selectedNormId: search.selectedNormId,
    }),
  });
  const navigate = route.useNavigate();
  const { t } = useTranslation('MvpRedesign');
  const documentsProgressDescriptionId = useId();
  const { canMutateTopic, topicDocuments } = props;
  const selectedNormRef = selectedNormId
    ? { id: selectedNormId, nodeType: 'norm' as const }
    : null;
  const { data: selectedNorm } = useLiveNode(selectedNormRef);
  const selectedGesetzRef = selectedNorm
    ? { id: selectedNorm.gesetzId, nodeType: 'gesetz' as const }
    : null;
  const { data: selectedGesetz } = useLiveNode(selectedGesetzRef);
  // eslint-disable-next-line no-restricted-syntax -- ephemeral UI expansion state for the live file tree
  const [expandedFolderIds, setExpandedFolderIds] = useState<
    Record<string, boolean>
  >({});
  const { isDocumentChecked, toggleDocumentChecked } =
    useTopicDocumentChecklist(verfahrenId, topicName, canMutateTopic);

  const selectDokument = (nextDokumentId: string) => {
    navigate({
      search: (prev) => ({
        ...prev,
        selectedDocumentId:
          prev.selectedDocumentId === nextDokumentId
            ? undefined
            : nextDokumentId,
        previewDocumentId: nextDokumentId,
      }),
      replace: true,
      resetScroll: false,
    });
  };

  const toggleFolder = (folderId: string) => {
    setExpandedFolderIds((prev) => ({
      ...prev,
      [folderId]: !(prev[folderId] ?? true),
    }));
  };

  // eslint-disable-next-line no-restricted-syntax -- rebuilding the nested document tree on every checklist or route-state change is measurably avoidable work for large MVP topics.
  const documentsTree = useMemo(
    () =>
      buildDocumentFileTree(topicDocuments, {
        rootLabel: t('DocumentsTabContent.documentsRootLabel'),
      }),
    [t, topicDocuments],
  );
  const totalDocumentCount = topicDocuments.length;
  const bearbeiteteDocumentCount = topicDocuments.filter((dokument) =>
    isDocumentChecked(dokument.id),
  ).length;
  const selectedNormLabel = selectedNorm
    ? getNormReferenceLabel(selectedNorm, selectedGesetz?.jurabk ?? null)
    : null;
  const documentsProgressText = t('DocumentsTabContent.documentsGesichtet', {
    done: bearbeiteteDocumentCount,
    total: totalDocumentCount,
  });

  const isRootExpanded = expandedFolderIds['root'] ?? true;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto p-1 md:p-4">
        <Accordion
          value={isRootExpanded ? ['root'] : []}
          onValueChange={(values) => {
            const shouldExpand = values.includes('root');
            if (shouldExpand !== isRootExpanded) {
              toggleFolder('root');
            }
          }}
        >
          <AccordionItem value="root">
            <div className="flex w-full items-center gap-3">
              <div className="min-w-0 flex-1">
                <AccordionTrigger className="flex w-full min-w-0 items-center gap-2 px-1 py-1.5">
                  <ChevronRight
                    className={cn(
                      'size-4 shrink-0 transition-transform duration-200',
                      isRootExpanded && 'rotate-90',
                    )}
                    aria-hidden="true"
                  />
                  <Folder
                    className="size-4 shrink-0 text-text-secondary"
                    aria-hidden="true"
                  />
                  <span className="flex-1 truncate text-left text-[13px] text-text-secondary">
                    {documentsTree.name}
                  </span>
                </AccordionTrigger>
              </div>
              <TooltipWrapper
                content={t('DocumentsTabContent.documentsGesichtetTooltip')}
                side="top"
                align="end"
                className="max-w-80"
              >
                <span
                  // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- tooltip trigger anchor; tabIndex makes the progress status keyboard-reachable.
                  tabIndex={0}
                  role="group"
                  aria-label={documentsProgressText}
                  aria-describedby={documentsProgressDescriptionId}
                  className="focus-ring shrink-0 cursor-default rounded-sm"
                >
                  <span id={documentsProgressDescriptionId} className="sr-only">
                    {t('DocumentsTabContent.documentsGesichtetTooltip')}
                  </span>
                  <StatusBadge
                    variant={
                      bearbeiteteDocumentCount > 0 ? 'neutral' : 'default'
                    }
                    className="shrink-0"
                  >
                    {documentsProgressText}
                  </StatusBadge>
                </span>
              </TooltipWrapper>
            </div>
            {isRootExpanded ? (
              <AccordionContent>
                <MvpSelectionLabelsProvider
                  selectedNormLabel={selectedNormLabel}
                >
                  <TreeChildren
                    items={documentsTree.children}
                    depth={1}
                    expandedFolderIds={expandedFolderIds}
                    onToggleFolder={toggleFolder}
                    isDocumentReviewed={isDocumentChecked}
                    onToggleDocumentReviewed={toggleDocumentChecked}
                    onSelectDocument={selectDokument}
                    selectedDocumentId={selectedDocumentId ?? null}
                    selectedNormId={selectedNormId}
                    canMutateTopic={canMutateTopic}
                  />
                </MvpSelectionLabelsProvider>
              </AccordionContent>
            ) : null}
          </AccordionItem>
        </Accordion>
      </div>
    </div>
  );
};
