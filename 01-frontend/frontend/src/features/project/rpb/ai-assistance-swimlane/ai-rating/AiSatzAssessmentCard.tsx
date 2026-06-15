import type { NodeRefByType } from '@/db/nodes/types';
import { useNode } from '@/db/nodes/hooks/useNodes';
import { NodeFeedbackThumbButtons } from '@/features/feedback/NodeFeedbackThumbButtons';
import { usePdfPopout } from '@/features/project/pdf-popout/PdfPopoutWorkspaceContext';
import { Button } from '@/features/ui/button/Button';
import { InjectReferenceLinks } from '@/features/ui/inject-reference-links/InjectReferenceLinks';
import { Link } from '@tanstack/react-router';
import { Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { AiCardHeader } from '../shared/AiCardHeader';
import {
  AiBewertungReferencesCard,
  AiBewertungReferencesCardSkeleton,
} from './AiBewertungReferencesCard';
import {
  openBewertungReference,
  type ClickedKiReference,
} from './aiReferenceLinks';
import { getAssessmentResultLabel } from './aiBewertungSummary';
import { useBewertungReferencesData } from './useBewertungReferencesData';
import { useOpenRpbPreviewDocument } from '../shared/useOpenRpbPreviewDocument';

type AiSatzAssessmentCardProps = {
  bewertungRef: NodeRefByType<'bewertung'>;
  satzRef: NodeRefByType<'satz'>;
  verfahrenId: string;
};

export function AiSatzAssessmentCard(props: AiSatzAssessmentCardProps) {
  const { bewertungRef, satzRef, verfahrenId } = props;
  const { t } = useTranslation('Rpb');
  const { openConnectedFile, jumpToConnectedFilePage } = usePdfPopout();
  const openPreviewDocument = useOpenRpbPreviewDocument();
  const { data: bewertung } = useNode(bewertungRef);
  const assessmentSummary = bewertung?.kurzform ?? '';
  const assessmentResultLabel = getAssessmentResultLabel(t, bewertung);
  const {
    documents,
    groups,
    references: assessmentReferences,
  } = useBewertungReferencesData(bewertungRef, [assessmentSummary]);
  const handleReferenceClick = (clickedReference: ClickedKiReference) => {
    openBewertungReference(
      clickedReference,
      documents,
      openPreviewDocument,
      jumpToConnectedFilePage,
      openConnectedFile,
    );
  };

  return (
    <>
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
        <AiCardHeader
          titleKey="aiAssistance.assessment"
          badgeLabel={assessmentResultLabel}
          badgeVariant="neutral"
          trailing={<NodeFeedbackThumbButtons targetRef={bewertungRef} />}
        />
        <div className="px-3 py-2">
          <div className="text-[13px] leading-[18px] font-normal tracking-[-0.13px] text-slate-700 not-italic [&_p]:mb-0">
            <InjectReferenceLinks
              references={assessmentReferences}
              text={assessmentSummary}
              format="text"
              onReferenceClick={handleReferenceClick}
            />
          </div>
        </div>
        <div className="p-1">
          <Button
            asChild
            variant="secondary"
            size="sm"
            aria-label={t('aiAssistance.showAssessment')}
          >
            <Link
              to="/verfahren/$verfahrenId/rpb"
              params={{ verfahrenId }}
              search={(prev) => ({
                ...prev,
                satzId: satzRef.id,
                rechtsmethodikSatzId: undefined,
                participationSubtopicId: undefined,
              })}
              resetScroll={false}
            >
              {t('aiAssistance.showAssessment')}
            </Link>
          </Button>
        </div>
      </div>

      {groups.length > 0 ? (
        <Suspense fallback={<AiBewertungReferencesCardSkeleton />}>
          <AiBewertungReferencesCard bewertungRef={bewertungRef} />
        </Suspense>
      ) : null}
    </>
  );
}
