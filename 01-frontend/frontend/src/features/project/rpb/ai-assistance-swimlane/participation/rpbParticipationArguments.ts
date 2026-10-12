import { toCompositeKey } from '@/db/nodes/compositeKey';
import { getDescendantNodeRefsByType } from '@/db/nodes/examinationGraphModel';
import type { ProjectNodeIndex } from '@/db/nodes/examinationGraphModel';
import type { NodePayloadByType, NodeRefByType } from '@/db/nodes/types';

export type RpbArgumentNode = NodePayloadByType<'argument'>;
export type RpbSubtopicNode = NodePayloadByType<'subtopic'>;

export const RPB_PARTICIPATION_SONSTIGE_SUBTOPIC_ID = '__sonstige__';

const argumentReferenceCollator = new Intl.Collator('de', {
  numeric: true,
  sensitivity: 'base',
});

export type RpbParticipationSubtopicItem = {
  id: string;
  label: string;
  arguments: RpbArgumentNode[];
  totalCount: number;
  validCount: number;
  inBeschlussCount: number;
  isGeneratedSonstige: boolean;
};

export const getRpbArgumentReference = (argument: RpbArgumentNode) =>
  argument.argumentId?.trim() || argument.id;

const compareRpbArgumentReferences = (
  left: RpbArgumentNode,
  right: RpbArgumentNode,
) =>
  argumentReferenceCollator.compare(
    getRpbArgumentReference(left),
    getRpbArgumentReference(right),
  ) || argumentReferenceCollator.compare(left.id, right.id);

export const sortRpbArguments = (argumentsList: RpbArgumentNode[]) =>
  [...argumentsList].sort((left, right) => {
    const validityComparison =
      Number(Boolean(right.isValidArgument)) -
      Number(Boolean(left.isValidArgument));

    if (validityComparison !== 0) {
      return validityComparison;
    }

    return compareRpbArgumentReferences(left, right);
  });

const getRpbParticipationSubtopicMetrics = (
  id: string,
  label: string,
  groupArguments: RpbArgumentNode[],
  isGeneratedSonstige: boolean,
): RpbParticipationSubtopicItem => {
  const sortedArguments = sortRpbArguments(groupArguments);
  const validArguments = sortedArguments.filter((argument) =>
    Boolean(argument.isValidArgument),
  );

  return {
    id,
    label,
    arguments: sortedArguments,
    totalCount: sortedArguments.length,
    validCount: validArguments.length,
    inBeschlussCount: validArguments.filter((argument) => argument.inVae)
      .length,
    isGeneratedSonstige,
  };
};

export const buildRpbParticipationSubtopicItemFromArguments = (
  id: string,
  label: string,
  argumentsList: RpbArgumentNode[],
  isGeneratedSonstige = false,
) =>
  getRpbParticipationSubtopicMetrics(
    id,
    label,
    argumentsList,
    isGeneratedSonstige,
  );

export const getRpbSonstigeArgumentRefs = (
  index: ProjectNodeIndex,
  topicRef: NodeRefByType<'topic'>,
) => {
  const topicArgumentRefs = getDescendantNodeRefsByType(
    index,
    topicRef.id,
    'argument',
  );
  const topicSubtopicRefs = getDescendantNodeRefsByType(
    index,
    topicRef.id,
    'subtopic',
  );
  const assignedArgumentKeys = new Set(
    topicSubtopicRefs.flatMap((subtopicRef) =>
      getDescendantNodeRefsByType(index, subtopicRef.id, 'argument').map(
        (argumentRef) => toCompositeKey(argumentRef),
      ),
    ),
  );

  return topicArgumentRefs.filter(
    (argumentRef) => !assignedArgumentKeys.has(toCompositeKey(argumentRef)),
  );
};
