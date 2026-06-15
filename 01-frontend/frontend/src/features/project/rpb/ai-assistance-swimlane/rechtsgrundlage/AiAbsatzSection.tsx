import type { NodePayloadByType, NodeRefByType } from '@/db/nodes/types';
import { FeedbackLookupProvider } from '@/features/feedback/FeedbackLookupProvider';
import { Accordion } from '@/features/ui/accordion/Accordion';
import { useDescendants } from '@/db/nodes/hooks/useDescendants';
import { useNodes } from '@/db/nodes/hooks/useNodes';
import { Suspense } from 'react';
import { AiSatzRow, AiSatzRowSkeleton } from './AiSatzRow';

type AiAbsatzSectionProps = {
  absatzRef: NodeRefByType<'absatz'>;
  hasMultipleAbsaetze: boolean;
  requestTitlePrefix?: string;
  requestTitleSuffix?: string;
  showDivider: boolean;
  showMissingAssessmentTooltip?: boolean;
};

const sortSatzRefsByPosition = (
  satzRefs: NodeRefByType<'satz'>[],
  saetze: NodePayloadByType<'satz'>[],
) => {
  const originalIndexById = new Map(
    satzRefs.map((satzRef, index) => [satzRef.id, index]),
  );
  const positionById = new Map(saetze.map((satz) => [satz.id, satz.position]));

  return [...satzRefs].sort((left, right) => {
    const leftPosition = positionById.get(left.id);
    const rightPosition = positionById.get(right.id);

    if (leftPosition !== null && leftPosition !== undefined) {
      if (rightPosition !== null && rightPosition !== undefined) {
        return leftPosition - rightPosition;
      }

      return -1;
    }

    if (rightPosition !== null && rightPosition !== undefined) {
      return 1;
    }

    return (
      (originalIndexById.get(left.id) ?? 0) -
      (originalIndexById.get(right.id) ?? 0)
    );
  });
};

const hasMultipleSaetzeInAbsatz = (saetze: NodePayloadByType<'satz'>[]) => {
  return new Set(saetze.map((satz) => satz.satz_nr)).size > 1;
};

export const AiAbsatzSection = (props: AiAbsatzSectionProps) => {
  const {
    absatzRef,
    hasMultipleAbsaetze,
    requestTitlePrefix,
    requestTitleSuffix,
    showDivider,
    showMissingAssessmentTooltip = false,
  } = props;
  const satzRefs = useDescendants('satz', absatzRef);
  const bewertungRefs = useDescendants('bewertung', absatzRef);
  const { data: saetze } = useNodes(satzRefs);
  const saetzeById = new Map(saetze.map((satz) => [satz.id, satz]));
  const sortedSatzRefs = sortSatzRefsByPosition(satzRefs, saetze);
  const hasMultipleSaetze = hasMultipleSaetzeInAbsatz(saetze);

  return (
    <div className="flex flex-col">
      {showDivider && <hr className="border-border-primary" />}
      <FeedbackLookupProvider targetRefs={bewertungRefs}>
        <Accordion type="single" collapsible className="flex flex-col">
          {sortedSatzRefs.map((satzRef, index) => (
            <Suspense
              key={satzRef.id}
              fallback={<AiSatzRowSkeleton showDivider={index > 0} />}
            >
              <AiSatzRow
                absatzRef={absatzRef}
                hasMultipleAbsaetze={hasMultipleAbsaetze}
                hasMultipleSaetze={hasMultipleSaetze}
                requestTitlePrefix={requestTitlePrefix}
                requestTitleSuffix={requestTitleSuffix}
                satz={saetzeById.get(satzRef.id) ?? null}
                satzRef={satzRef}
                showDivider={index > 0}
                showMissingAssessmentTooltip={showMissingAssessmentTooltip}
              />
            </Suspense>
          ))}
        </Accordion>
      </FeedbackLookupProvider>
    </div>
  );
};
