import type { NodePayloadByType, NodeRefByType } from '@/db/nodes/types';
import type {
  ClickedInjectReference,
  InjectReferenceMap,
} from '@/features/ui/inject-reference-links/InjectReferenceLinks';

export type ClickedKiReference = ClickedInjectReference;

const PADDED_REFERENCE_ID_LENGTH = 4;
const REFERENCE_TOKEN_PATTERN = /\[(\d+)\]/g;

export const getSmallestReferencePageNumber = (pageNumbers: number[]) => {
  const positivePageNumbers = pageNumbers.filter(
    (pageNumber) => pageNumber > 0,
  );

  if (positivePageNumbers.length === 0) {
    return null;
  }

  return Math.min(...positivePageNumbers);
};

type OpenConnectedFile = (fileId: string) => void;
type SelectPreviewDocument = (documentId: string) => void;
type JumpToConnectedFilePage = (pageNumber: number, fileId?: string) => void;

export const openBewertungReference = (
  clickedReference: ClickedKiReference,
  documents: NodePayloadByType<'dokument'>[],
  selectPreviewDocument: SelectPreviewDocument,
  jumpToConnectedFilePage: JumpToConnectedFilePage,
  openConnectedFile?: OpenConnectedFile,
) => {
  const referencedDocument = documents.find(
    (dokument) => dokument.id === clickedReference.documentId,
  );
  const documentFileId = referencedDocument?.dmsFileId ?? null;

  if (!referencedDocument) {
    return;
  }

  selectPreviewDocument(referencedDocument.id);

  if (documentFileId) {
    openConnectedFile?.(documentFileId);
  }
  const pageNumber = getSmallestReferencePageNumber(
    clickedReference.pageNumbers,
  );

  if (pageNumber !== null && documentFileId) {
    jumpToConnectedFilePage(pageNumber, documentFileId);
  }
};

export const openBewertungDokument = (
  dokumentId: string,
  documents: NodePayloadByType<'dokument'>[],
  selectPreviewDocument: SelectPreviewDocument,
  openConnectedFile?: OpenConnectedFile,
) => {
  const referencedDocument = documents.find(
    (dokument) => dokument.id === dokumentId,
  );

  if (!referencedDocument) {
    return;
  }

  selectPreviewDocument(referencedDocument.id);

  if (referencedDocument.dmsFileId) {
    openConnectedFile?.(referencedDocument.dmsFileId);
  }
};

export const getBewertungDokumentRefs = (
  bewertungQuellen: NodePayloadByType<'bewertung_quelle'>[],
): NodeRefByType<'dokument'>[] => {
  const seenDocumentIds = new Set<string>();
  const dokumentRefs: NodeRefByType<'dokument'>[] = [];

  for (const bewertungQuelle of bewertungQuellen) {
    if (seenDocumentIds.has(bewertungQuelle.dokumentId)) {
      continue;
    }

    seenDocumentIds.add(bewertungQuelle.dokumentId);
    dokumentRefs.push({
      id: bewertungQuelle.dokumentId,
      nodeType: 'dokument',
    });
  }

  return dokumentRefs;
};

const getReferenceIds = (referenceNumber: number) => {
  const plainReferenceId = String(referenceNumber);
  const paddedReferenceId = plainReferenceId.padStart(
    PADDED_REFERENCE_ID_LENGTH,
    '0',
  );

  if (plainReferenceId === paddedReferenceId) {
    return [plainReferenceId];
  }

  return [plainReferenceId, paddedReferenceId];
};

const getNormalizedReferenceId = (referenceId: string) => {
  return String(Number.parseInt(referenceId, 10));
};

const getNextAvailableFallbackReferenceIds = (
  startingReferenceNumber: number,
  usedReferenceIds: Set<string>,
) => {
  let referenceNumber = startingReferenceNumber;

  for (;;) {
    const referenceIds = getReferenceIds(referenceNumber);

    if (
      !referenceIds.some((referenceId) => usedReferenceIds.has(referenceId))
    ) {
      return referenceIds;
    }

    referenceNumber += 1;
  }
};

const appendDistinctReferenceId = (
  orderedReferenceIds: string[],
  seenReferenceIds: Set<string>,
  referenceId: string,
) => {
  if (seenReferenceIds.has(referenceId)) {
    return;
  }

  seenReferenceIds.add(referenceId);
  orderedReferenceIds.push(referenceId);
};

export const getDistinctReferenceIdsFromMarkdown = (
  markdownTexts: string[],
) => {
  const seenReferenceIds = new Set<string>();
  const orderedReferenceIds: string[] = [];

  for (const markdownText of markdownTexts) {
    for (const match of markdownText.matchAll(REFERENCE_TOKEN_PATTERN)) {
      appendDistinctReferenceId(
        orderedReferenceIds,
        seenReferenceIds,
        getNormalizedReferenceId(match[1] ?? ''),
      );
    }
  }

  return orderedReferenceIds;
};

export const createBewertungReferenceMap = (
  bewertungQuellen: NodePayloadByType<'bewertung_quelle'>[],
  documents: NodePayloadByType<'dokument'>[],
  markdownTexts: string[],
): InjectReferenceMap => {
  const dokumentById = new Map(
    documents.map((dokument) => [dokument.id, dokument] as const),
  );
  const orderedReferenceIds =
    getDistinctReferenceIdsFromMarkdown(markdownTexts);
  const references: InjectReferenceMap = {};
  const usedReferenceIds = new Set<string>();

  bewertungQuellen.forEach((bewertungQuelle, referenceIndex) => {
    const dokument = dokumentById.get(bewertungQuelle.dokumentId);
    const referenceIds = bewertungQuelle.citedSvmId
      ? getReferenceIds(Number.parseInt(bewertungQuelle.citedSvmId, 10))
      : (() => {
          const discoveredReferenceId = orderedReferenceIds[referenceIndex];
          return discoveredReferenceId
            ? getReferenceIds(Number.parseInt(discoveredReferenceId, 10))
            : getNextAvailableFallbackReferenceIds(
                referenceIndex + 1,
                usedReferenceIds,
              );
        })();
    const reference = {
      chunkIds: bewertungQuelle.chunkIds,
      documentId: bewertungQuelle.dokumentId,
      node_id: bewertungQuelle.id,
      pageNumbers: bewertungQuelle.pageNumbers,
      title:
        bewertungQuelle.title.trim() ||
        dokument?.filename ||
        bewertungQuelle.id,
    };

    for (const referenceId of referenceIds) {
      references[referenceId] = reference;
      usedReferenceIds.add(referenceId);
    }
  });

  return references;
};
