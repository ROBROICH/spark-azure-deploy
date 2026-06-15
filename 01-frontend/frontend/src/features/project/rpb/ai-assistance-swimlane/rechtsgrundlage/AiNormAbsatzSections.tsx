import type { NodeRefByType } from '@/db/nodes/types';
import { useDescendants } from '@/db/nodes/hooks/useDescendants';
import { useNode, useNodes } from '@/db/nodes/hooks/useNodes';
import { AiAbsatzSection } from './AiAbsatzSection';
import { sortAbsatzRefsByNumber } from './aiNormAbsatzSorting';
import { useKiTopicNormState } from './AiTopicNormContext';

type AiNormAbsatzSectionsProps = {
  normRef: NodeRefByType<'norm'>;
  showMissingAssessmentTooltip?: boolean;
};

export const AiNormAbsatzSections = (props: AiNormAbsatzSectionsProps) => {
  const { normRef, showMissingAssessmentTooltip = false } = props;
  const absatzRefs = useDescendants('absatz', normRef);
  const { data: absaetze } = useNodes(absatzRefs);
  const { topicNorm } = useKiTopicNormState();
  const { data: norm } = useNode(normRef);
  const sortedAbsatzRefs = sortAbsatzRefsByNumber(absatzRefs, absaetze);
  const hasMultipleAbsaetze = absatzRefs.length > 1;
  const requestTitlePrefix = norm ? `§ ${norm.paragraph_nr}` : undefined;
  const requestTitleSuffix = topicNorm?.jurabk;

  return (
    <div className="flex flex-col gap-4">
      {sortedAbsatzRefs.map((absatzRef, index) => (
        <AiAbsatzSection
          key={absatzRef.id}
          absatzRef={absatzRef}
          hasMultipleAbsaetze={hasMultipleAbsaetze}
          requestTitlePrefix={requestTitlePrefix}
          requestTitleSuffix={requestTitleSuffix}
          showDivider={index > 0}
          showMissingAssessmentTooltip={showMissingAssessmentTooltip}
        />
      ))}
    </div>
  );
};
