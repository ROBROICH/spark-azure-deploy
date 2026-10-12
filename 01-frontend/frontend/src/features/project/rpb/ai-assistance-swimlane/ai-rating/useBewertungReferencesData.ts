import { useDescendantNodes } from '@/db/nodes/hooks/useDescendantNodes';
import type { NodePayloadByType, NodeRefByType } from '@/db/nodes/types';
import { useNodes } from '@/db/nodes/hooks/useNodes';
import {
  createBewertungReferenceMap,
  getBewertungDokumentRefs,
  getSmallestReferencePageNumber,
} from './aiReferenceLinks';

type BewertungReferenceGroup = {
  dokument: NodePayloadByType<'dokument'> | null;
  dokumentId: string;
  quellen: NodePayloadByType<'bewertung_quelle'>[];
};

const groupBewertungQuellenByDokument = (
  bewertungQuellen: NodePayloadByType<'bewertung_quelle'>[],
  documents: NodePayloadByType<'dokument'>[],
) => {
  const dokumentById = new Map(
    documents.map((dokument) => [dokument.id, dokument] as const),
  );
  const groupsByDokumentId = new Map<string, BewertungReferenceGroup>();

  for (const bewertungQuelle of bewertungQuellen) {
    const existingGroup = groupsByDokumentId.get(bewertungQuelle.dokumentId);

    if (existingGroup) {
      existingGroup.quellen.push(bewertungQuelle);
      continue;
    }

    groupsByDokumentId.set(bewertungQuelle.dokumentId, {
      dokument: dokumentById.get(bewertungQuelle.dokumentId) ?? null,
      dokumentId: bewertungQuelle.dokumentId,
      quellen: [bewertungQuelle],
    });
  }

  return Array.from(groupsByDokumentId.values()).map((group) => ({
    ...group,
    quellen: [...group.quellen].sort((left, right) => {
      const leftFirstPage =
        getSmallestReferencePageNumber(left.pageNumbers) ??
        Number.POSITIVE_INFINITY;
      const rightFirstPage =
        getSmallestReferencePageNumber(right.pageNumbers) ??
        Number.POSITIVE_INFINITY;

      if (leftFirstPage !== rightFirstPage) {
        return leftFirstPage - rightFirstPage;
      }

      return left.id.localeCompare(right.id, 'de');
    }),
  }));
};

export const useBewertungReferencesData = (
  bewertungRef: NodeRefByType<'bewertung'> | null | undefined,
  markdownTexts: string[] = [],
) => {
  const { data: bewertungQuellen } = useDescendantNodes(
    'bewertung_quelle',
    bewertungRef,
  );
  const dokumentRefs = getBewertungDokumentRefs(bewertungQuellen);
  const { data: documents } = useNodes(dokumentRefs);

  return {
    bewertungQuellen,
    documents,
    groups: groupBewertungQuellenByDokument(bewertungQuellen, documents),
    references: createBewertungReferenceMap(
      bewertungQuellen,
      documents,
      markdownTexts,
    ),
  };
};
