import type {
  LegalBasisNormResponse,
  LegalBasisNormSelection,
} from '@/api-clients/examination-module';
import type { NodePayloadByType, NodeRefByType } from '@/db/nodes/types';
import type { FederalStateCode } from '@/features/project/data/project-details-form/federalStates';
import { getStoredParentRefByType } from '../storedParentRefs';
import {
  compareParagraphNumbers,
  createLegalBasisSelectionKey,
} from './rechtsgrundlageParagraphNumbers';

export type AvailableNormEntry = {
  selectionKey: string;
  legalBasis: LegalBasisNormSelection;
  norm: {
    id: string;
    gesetz_id: string;
    paragraph_nr: string;
    paragraph_titel?: string | null;
    text?: string | null;
  };
  gesetz: { id: string; jurabk: string; name?: string } | null;
  projectNorm: NodePayloadByType<'norm'> | null;
  topicNorms: NodePayloadByType<'topic_norm'>[];
  topicNorm: NodePayloadByType<'topic_norm'> | null;
  topicNormLinks: AvailableTopicNormLink[];
};

export type AvailableTopicNormLink = {
  norm: NodePayloadByType<'norm'> | null;
  topicNorm: NodePayloadByType<'topic_norm'>;
};

export type AvailableNormLawGroup = {
  id: string;
  gesetz: AvailableNormEntry['gesetz'];
  norms: AvailableNormEntry[];
};

export const sortAvailableNormEntriesByParagraphNumber = (
  normEntries: AvailableNormEntry[],
) => {
  return [...normEntries].sort((left, right) => {
    const paragraphComparison = compareParagraphNumbers(
      left.norm.paragraph_nr,
      right.norm.paragraph_nr,
    );

    if (paragraphComparison !== 0) {
      return paragraphComparison;
    }

    return left.norm.id.localeCompare(right.norm.id, 'de');
  });
};

const collectProjectNormsByTopicNormId = (
  normen: NodePayloadByType<'norm'>[],
  topicNormById: Map<string, NodePayloadByType<'topic_norm'>>,
) => {
  const projectNormsByTopicNormId = new Map<
    string,
    NodePayloadByType<'norm'>[]
  >();

  for (const norm of normen) {
    for (const parentRef of norm.frontend_parent_ids
      .map((parentId) => getStoredParentRefByType(parentId, 'topic_norm'))
      .filter(
        (topicNormRef): topicNormRef is NodeRefByType<'topic_norm'> =>
          topicNormRef !== null && topicNormById.has(topicNormRef.id),
      )) {
      const existingNorms = projectNormsByTopicNormId.get(parentRef.id) ?? [];
      projectNormsByTopicNormId.set(parentRef.id, [...existingNorms, norm]);
    }
  }

  return projectNormsByTopicNormId;
};

const collectTopicNormsBySelectionKey = (
  topicNormById: Map<string, NodePayloadByType<'topic_norm'>>,
) => {
  const topicNormsBySelectionKey = new Map<
    string,
    NodePayloadByType<'topic_norm'>[]
  >();

  for (const topicNorm of topicNormById.values()) {
    const selectionKey = createLegalBasisSelectionKey(
      topicNorm.jurabk,
      topicNorm.paragraph_nr,
    );
    const existingTopicNorms = topicNormsBySelectionKey.get(selectionKey) ?? [];
    topicNormsBySelectionKey.set(selectionKey, [
      ...existingTopicNorms,
      topicNorm,
    ]);
  }

  return topicNormsBySelectionKey;
};

const createAvailableNormEntry = (
  legalBasisNorm: LegalBasisNormResponse,
  topicNormsBySelectionKey: Map<string, NodePayloadByType<'topic_norm'>[]>,
  projectNormsByTopicNormId: Map<string, NodePayloadByType<'norm'>[]>,
) => {
  const selectionKey = createLegalBasisSelectionKey(
    legalBasisNorm.jurabk,
    legalBasisNorm.paragraph_nr,
  );
  const topicNorms = topicNormsBySelectionKey.get(selectionKey) ?? [];
  const topicNormLinks = topicNorms.flatMap<AvailableTopicNormLink>(
    (topicNorm) => {
      const projectNorms = projectNormsByTopicNormId.get(topicNorm.id);

      if (!projectNorms || projectNorms.length === 0) {
        return [{ topicNorm, norm: null }];
      }

      return projectNorms.map((norm) => ({ topicNorm, norm }));
    },
  );
  const projectNorm = topicNormLinks.find((link) => link.norm)?.norm ?? null;

  return {
    selectionKey,
    legalBasis: {
      jurabk: legalBasisNorm.jurabk,
      paragraph_nr: legalBasisNorm.paragraph_nr,
    },
    norm: {
      id: selectionKey,
      gesetz_id: legalBasisNorm.gesetz.id,
      paragraph_nr: legalBasisNorm.paragraph_nr,
      paragraph_titel: legalBasisNorm.paragraph_titel,
      text: legalBasisNorm.norm.text,
    },
    gesetz: legalBasisNorm.gesetz,
    projectNorm,
    topicNorms,
    topicNorm: topicNorms[0] ?? null,
    topicNormLinks,
  };
};

const isLegalBasisNormAvailableForProject = (
  legalBasisNorm: LegalBasisNormResponse,
  projectBundeslandCode: FederalStateCode | null,
) => {
  if (!legalBasisNorm.is_deconstructed) {
    return false;
  }

  return (
    legalBasisNorm.bundesland === null ||
    legalBasisNorm.bundesland === undefined ||
    legalBasisNorm.bundesland === projectBundeslandCode
  );
};

/**
 * Builds the editable Rechtsgrundlage view model from the LawDB norm corpus and
 * the topic-linked project graph state.
 */
export const createAvailableRechtsgrundlageData = (
  legalBasisNorms: LegalBasisNormResponse[],
  projectNormen: NodePayloadByType<'norm'>[],
  topicNormById: Map<string, NodePayloadByType<'topic_norm'>>,
  projectBundeslandCode: FederalStateCode | null,
) => {
  const projectNormsByTopicNormId = collectProjectNormsByTopicNormId(
    projectNormen,
    topicNormById,
  );
  const topicNormsBySelectionKey =
    collectTopicNormsBySelectionKey(topicNormById);
  const availableNormEntries = legalBasisNorms
    .filter((legalBasisNorm) =>
      isLegalBasisNormAvailableForProject(
        legalBasisNorm,
        projectBundeslandCode,
      ),
    )
    .map((legalBasisNorm) =>
      createAvailableNormEntry(
        legalBasisNorm,
        topicNormsBySelectionKey,
        projectNormsByTopicNormId,
      ),
    );

  const selectedNormIds = new Set(
    availableNormEntries
      .filter((normEntry) => normEntry.topicNorms.length > 0)
      .map((normEntry) => normEntry.selectionKey),
  );
  const availableLawGroupsById = new Map<string, AvailableNormLawGroup>();

  for (const normEntry of availableNormEntries) {
    const lawGroupId = normEntry.gesetz.id;
    const existingLawGroup = availableLawGroupsById.get(lawGroupId);

    if (existingLawGroup) {
      existingLawGroup.norms.push(normEntry);
      continue;
    }

    availableLawGroupsById.set(lawGroupId, {
      id: lawGroupId,
      gesetz: normEntry.gesetz,
      norms: [normEntry],
    });
  }

  return {
    availableLawGroups: Array.from(availableLawGroupsById.values()).map(
      (lawGroup) => ({
        ...lawGroup,
        norms: sortAvailableNormEntriesByParagraphNumber(lawGroup.norms),
      }),
    ),
    availableNormEntries,
    selectedNormIds,
  };
};
