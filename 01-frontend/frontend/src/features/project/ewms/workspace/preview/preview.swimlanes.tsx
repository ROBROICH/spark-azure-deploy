import { useLiveNode } from '@/db/nodes/hooks/useLiveNodes';
import { useFileDownloadUrl } from '@/features/project/data/project-files/useFileDownloadUrl';
import { PdfQuickView } from '@/features/project/pdf-quick-view/PdfQuickView';
import { SafeMarkdown } from '@/features/ui/safe-markdown/SafeMarkdown';
import { Swimlanes } from '@/features/ui/swimlanes/Swimlanes';
import { useSwimlanesGroupSearchState } from '@/features/ui/swimlanes/useSwimlanesGroupSearchState';
import { File, ScanText } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { EwmsObjectionListItem } from '../../data/ewms.nodes';
import { getEwmsObjectionDisplayName } from '../../data/ewms.nodes';
import {
  ewmsDocumentViewerTabSearchSchema,
  type EwmsDocumentViewerTab,
} from '../../ewms.search';
import { ExtractedTextLoadingSkeleton } from './ExtractedTextLoadingSkeleton';

// EWMS intentionally keeps local swimlane roots inside each tab/detail workflow.
// This is a deliberate exception to the workspace-wide swimlane owners expected
// by .agents/rules/codebase-structure/project-swimlane-owners.md.
type PreviewLanesProps = {
  selectedItem: EwmsObjectionListItem | undefined;
};

const EXTRACTED_TEXT_LANE_ID = 'extractedText' satisfies EwmsDocumentViewerTab;
const ORIGINAL_FILE_LANE_ID = 'originalFile' satisfies EwmsDocumentViewerTab;
const extractedTextMarkdownClassName =
  'text-sm leading-relaxed text-primary [&_code]:rounded-md [&_code]:bg-slate-100 [&_code]:px-1 [&_code]:py-0.5 [&_em]:italic [&_h1]:mb-3 [&_h1]:text-lg [&_h1]:font-medium [&_h2]:mb-2 [&_h2]:text-base [&_h2]:font-medium [&_h3]:mb-2 [&_h3]:text-sm [&_h3]:font-medium [&_hr]:my-4 [&_hr]:border-gray-200 [&_li]:ml-4 [&_li]:list-disc [&_ol>li]:list-decimal [&_ol]:space-y-1 [&_ol]:pl-5 [&_p]:mb-3 [&_p:last-child]:mb-0 [&_pre]:mb-3 [&_pre]:rounded-md [&_pre]:bg-slate-100 [&_pre]:p-3 [&_strong]:font-medium [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-gray-200 [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-gray-200 [&_th]:bg-gray-50 [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:font-medium [&_ul]:space-y-1 [&_ul]:pl-5 [&_blockquote]:border-l-2 [&_blockquote]:border-gray-300 [&_blockquote]:pl-3 [&_blockquote]:italic [&_blockquote]:text-gray-600';

/**
 * Keeps extracted markdown and original PDF panes route-synced for the selected EWMS entry.
 */
export const PreviewLanes = (props: PreviewLanesProps) => {
  const { selectedItem } = props;
  const { t } = useTranslation('Ewms');
  const documentViewerTab = useSwimlanesGroupSearchState(
    ewmsDocumentViewerTabSearchSchema,
  );
  const objection = selectedItem?.entry;
  const isPromptInjection =
    objection?.extraction_status === 'prompt_injection_error';
  const markdownRef = objection?.beteiligungs_eingang_markdown_id
    ? {
        id: objection.beteiligungs_eingang_markdown_id,
        node_type: 'beteiligungs_eingang_markdown' as const,
      }
    : undefined;
  const { data: markdownNode, isLoading: isMarkdownLoading } =
    useLiveNode(markdownRef);
  const { downloadUrl, isLoading: isDocumentLoading } = useFileDownloadUrl(
    selectedItem?.entry.file_id,
  );

  return (
    <Swimlanes.Group
      unfoldOn="widescreen"
      {...documentViewerTab}
      ariaLabel={t('documentViewer.navigation')}
    >
      <Swimlanes.Lane
        id={EXTRACTED_TEXT_LANE_ID}
        title={t('documentViewer.tabs.extractedText')}
        icon={ScanText}
      >
        <div className="min-h-0 flex-1 overflow-auto p-3">
          {selectedItem && !objection ? (
            <div className="rounded border border-slate-200 bg-white p-3">
              <ExtractedTextLoadingSkeleton />
            </div>
          ) : objection ? (
            <div className="rounded border border-slate-200 bg-white p-3">
              {isPromptInjection ? (
                <p className="text-sm leading-6 text-red-900">
                  {t('documentViewer.promptInjectionBlocked')}
                </p>
              ) : isMarkdownLoading ? (
                <ExtractedTextLoadingSkeleton />
              ) : markdownNode?.text ? (
                <SafeMarkdown
                  as="article"
                  className={extractedTextMarkdownClassName}
                  hrefMode="remove"
                >
                  {markdownNode.text}
                </SafeMarkdown>
              ) : (
                <p className="text-sm leading-6 text-slate-500">
                  {t('documentViewer.emptyExtractedText')}
                </p>
              )}
            </div>
          ) : (
            <div className="flex h-full items-center justify-center text-center text-sm text-text-secondary">
              {t('documentViewer.empty')}
            </div>
          )}
        </div>
      </Swimlanes.Lane>
      <Swimlanes.Lane
        id={ORIGINAL_FILE_LANE_ID}
        title={t('documentViewer.tabs.originalFile')}
        icon={File}
      >
        <PdfQuickView
          variant="embedded"
          showHeader={false}
          title={
            selectedItem
              ? getEwmsObjectionDisplayName(selectedItem)
              : t('documentViewer.tabs.originalFile')
          }
          pdfUrl={downloadUrl}
          isLoading={isDocumentLoading}
          onClose={() =>
            documentViewerTab.onValueChange(EXTRACTED_TEXT_LANE_ID)
          }
        />
      </Swimlanes.Lane>
    </Swimlanes.Group>
  );
};
