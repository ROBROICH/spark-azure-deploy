import type { NodePayloadByType } from '@/db/nodes/types';
import { usePdfPopout } from '@/features/project/pdf-popout/PdfPopoutWorkspaceContext';
import { FeedbackLookupProvider } from '@/features/feedback/FeedbackLookupProvider';
import { NodeFeedbackThumbButtons } from '@/features/feedback/NodeFeedbackThumbButtons';
import { AiReferenceCard } from '@/features/ui/ai/AiReferenceCard';
import { AiReferenceRow } from '@/features/ui/ai/AiReferenceRow';
import { getRouteApi } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { FundstellenFocusCount } from './FundstellenFocusCount';
import { FundstellenNotInFocusHint } from './FundstellenNotInFocusHint';
import { doesFundstelleCarryAssessment } from './fundstellenReliability';
import type { FundstellenCardEntry } from './mvpFundstellenCardModels';

const route = getRouteApi('/verfahren/$verfahrenId/mvp/$topicName/');

type FundstellenSelectedReferenceCardProps = {
  document: NodePayloadByType<'dokument'> | null;
  entries: FundstellenCardEntry[];
};

/**
 * Shows the already-intersected document and norm Fundstellen results against
 * one connected PDF file so document opening and page jumps stay synchronized.
 */
export const FundstellenSelectedReferenceCard = (
  props: FundstellenSelectedReferenceCardProps,
) => {
  const { document, entries } = props;
  const { t } = useTranslation('MvpRedesign');
  const { openConnectedFile, jumpToConnectedFilePage } = usePdfPopout();
  const navigate = route.useNavigate();
  const feedbackTargetRefs = entries.map((entry) => ({
    id: entry.id,
    nodeType: 'fundstelle' as const,
  }));
  const documentLabel =
    document?.filename.split('/').pop() ??
    t('FundstellenTabContent.keinDokument');
  const connectedDocument = document?.dmsFileId ? document : null;
  const missingTitlePlaceholder = t(
    'FundstellenTabContent.missingTitlePlaceholder',
  );

  return (
    <AiReferenceCard
      title={t('FundstellenTabContent.referencesTitle')}
      titleTrailing={<FundstellenFocusCount entries={entries} />}
    >
      <div role="list" className="flex flex-col gap-1 p-1">
        <AiReferenceRow
          item={{ type: 'document', label: documentLabel }}
          onClick={
            connectedDocument
              ? () => {
                  navigate({
                    search: (prev) => ({
                      ...prev,
                      previewDocumentId: connectedDocument.id,
                    }),
                    replace: true,
                    resetScroll: false,
                  });
                  openConnectedFile(connectedDocument.dmsFileId);
                }
              : undefined
          }
        />
        <FeedbackLookupProvider targetRefs={feedbackTargetRefs}>
          {entries.map((entry) => {
            return (
              <div
                key={entry.id}
                role="presentation"
                className="flex items-center"
              >
                <div className="min-w-0 flex-1">
                  <AiReferenceRow
                    item={{
                      type: 'passage',
                      label: entry.title || missingTitlePlaceholder,
                      page: t('FundstellenSelectedReferenceCard.pageNumber', {
                        page: entry.pageNumber,
                      }),
                    }}
                    afterTitle={
                      <FundstellenNotInFocusHint
                        confidence={entry.confidence}
                      />
                    }
                    labelClassName={
                      doesFundstelleCarryAssessment(entry.confidence)
                        ? undefined
                        : 'text-slate-500'
                    }
                    onClick={
                      connectedDocument
                        ? () => {
                            navigate({
                              search: (prev) => ({
                                ...prev,
                                previewDocumentId: connectedDocument.id,
                              }),
                              replace: true,
                              resetScroll: false,
                            });
                            openConnectedFile(connectedDocument.dmsFileId);
                            jumpToConnectedFilePage(
                              entry.pageNumber,
                              connectedDocument.dmsFileId,
                            );
                          }
                        : undefined
                    }
                  />
                </div>
                <div className="pr-1">
                  <NodeFeedbackThumbButtons
                    targetRef={{ id: entry.id, nodeType: 'fundstelle' }}
                  />
                </div>
              </div>
            );
          })}
        </FeedbackLookupProvider>
      </div>
    </AiReferenceCard>
  );
};
