import type { NodeRefByType } from '@/db/nodes/types';
import { usePdfPopout } from '@/features/project/pdf-popout/PdfPopoutWorkspaceContext';
import { FeedbackLookupProvider } from '@/features/feedback/FeedbackLookupProvider';
import { NodeFeedbackThumbButtons } from '@/features/feedback/NodeFeedbackThumbButtons';
import { AiReferenceCard } from '@/features/ui/ai/AiReferenceCard';
import { AiReferenceRow } from '@/features/ui/ai/AiReferenceRow';
import { Skeleton } from '@/features/ui/skeleton/Skeleton';
import { useTranslation } from 'react-i18next';
import {
  openBewertungDokument,
  openBewertungReference,
} from './aiReferenceLinks';
import { useBewertungReferencesData } from './useBewertungReferencesData';
import { useOpenRpbPreviewDocument } from '../shared/useOpenRpbPreviewDocument';

const getReferencePageLabel = (
  pageNumbers: number[],
  t: (key: string, options?: Record<string, unknown>) => string,
) => {
  const uniquePositivePageNumbers = Array.from(
    new Set(pageNumbers.filter((pageNumber) => pageNumber > 0)),
  ).sort((left, right) => left - right);

  if (uniquePositivePageNumbers.length === 0) {
    return t('aiAssistance.referencePagesUnknown');
  }

  return t('aiAssistance.referencePages', {
    pages: uniquePositivePageNumbers.join(', '),
  });
};

type AiBewertungReferencesCardProps = {
  bewertungRef: NodeRefByType<'bewertung'>;
};

type ReferenceGroupItemsProps = {
  group: ReturnType<typeof useBewertungReferencesData>['groups'][number];
  documents: ReturnType<typeof useBewertungReferencesData>['documents'];
  openPreviewDocument: ReturnType<typeof useOpenRpbPreviewDocument>;
  openConnectedFile: ReturnType<typeof usePdfPopout>['openConnectedFile'];
  jumpToConnectedFilePage: ReturnType<
    typeof usePdfPopout
  >['jumpToConnectedFilePage'];
};

const ReferenceGroupItems = (props: ReferenceGroupItemsProps) => {
  const {
    group,
    documents,
    openPreviewDocument,
    openConnectedFile,
    jumpToConnectedFilePage,
  } = props;
  const { t } = useTranslation('Rpb');
  const dokumentLabel =
    group.dokument?.filename || group.dokument?.id || group.dokumentId;

  return (
    <>
      <AiReferenceRow
        key={`document-${group.dokumentId}`}
        item={{ type: 'document', label: dokumentLabel }}
        onClick={() =>
          openBewertungDokument(
            group.dokumentId,
            documents,
            openPreviewDocument,
            openConnectedFile,
          )
        }
      />
      {group.quellen.map((quelle) => (
        <div
          key={`passage-${quelle.id}`}
          role="presentation"
          className="flex items-center"
        >
          <div className="min-w-0 flex-1">
            <AiReferenceRow
              item={{
                type: 'passage',
                label:
                  quelle.title.trim() || dokumentLabel || quelle.dokumentId,
                page: getReferencePageLabel(quelle.pageNumbers, t),
              }}
              onClick={() =>
                openBewertungReference(
                  {
                    chunkIds: quelle.chunkIds,
                    documentId: quelle.dokumentId,
                    node_id: quelle.id,
                    pageNumbers: quelle.pageNumbers,
                    referenceId: quelle.id,
                    title:
                      quelle.title.trim() || dokumentLabel || quelle.dokumentId,
                  },
                  documents,
                  openPreviewDocument,
                  jumpToConnectedFilePage,
                  openConnectedFile,
                )
              }
            />
          </div>
          <div className="pr-1">
            <NodeFeedbackThumbButtons
              targetRef={{ id: quelle.id, nodeType: 'bewertung_quelle' }}
            />
          </div>
        </div>
      ))}
    </>
  );
};

/**
 * Renders AI reference rows for a Bewertung node, grouped by document, with per-quelle feedback.
 */
export const AiBewertungReferencesCard = (
  props: AiBewertungReferencesCardProps,
) => {
  const { bewertungRef } = props;
  const { t } = useTranslation('Rpb');
  const { openConnectedFile, jumpToConnectedFilePage } = usePdfPopout();
  const openPreviewDocument = useOpenRpbPreviewDocument();
  const { documents, groups } = useBewertungReferencesData(bewertungRef);
  const feedbackTargetRefs = groups.flatMap((group) =>
    group.quellen.map((quelle) => ({
      id: quelle.id,
      nodeType: 'bewertung_quelle' as const,
    })),
  );

  if (groups.length === 0) {
    return null;
  }

  return (
    <AiReferenceCard title={t('aiAssistance.references')}>
      <FeedbackLookupProvider targetRefs={feedbackTargetRefs}>
        <div role="list" className="flex flex-col gap-1">
          {groups.map((group) => (
            <ReferenceGroupItems
              key={group.dokumentId}
              group={group}
              documents={documents}
              openPreviewDocument={openPreviewDocument}
              openConnectedFile={openConnectedFile}
              jumpToConnectedFilePage={jumpToConnectedFilePage}
            />
          ))}
        </div>
      </FeedbackLookupProvider>
    </AiReferenceCard>
  );
};

export const AiBewertungReferencesCardSkeleton = () => {
  return (
    <div
      className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50"
      aria-hidden="true"
    >
      <div className="border-b border-slate-200 p-1">
        <Skeleton className="h-4 w-24" />
      </div>
      <div className="space-y-1 p-1">
        <Skeleton className="h-6 w-full" />
        <Skeleton className="h-6 w-11/12" />
        <Skeleton className="h-6 w-10/12" />
      </div>
    </div>
  );
};
