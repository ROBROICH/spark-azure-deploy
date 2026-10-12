import type { Contradiction } from '@/api-clients/backend';
import { getRouteApi, useNavigate } from '@tanstack/react-router';
import { invariant } from 'es-toolkit/util';

import { OccurrenceComparisonColumn } from './OccurrenceComparisonColumn';
import {
  getSelectedOccurrenceIndices,
  normalizeOccurrenceIndex,
} from './occurrenceSelection';

const route = getRouteApi('/verfahren/$verfahrenId/fvp/pp/');

type ComparisonTableProps = {
  contradiction: Contradiction;
};

type OccurrenceColumn = {
  occurrence: Contradiction['occurrences'][number];
  occurrenceIndex: number;
};

/**
 * Keeps the PP occurrence-comparison routing state under one owner while the
 * presentational column rendering lives in focused child components.
 */
export const ComparisonTable = (props: ComparisonTableProps) => {
  const { contradiction } = props;
  const { occurrences } = contradiction;
  const navigate = useNavigate();
  const {
    leftOccurrenceIndex: requestedLeftOccurrenceIndex,
    previewDocumentId,
    rightOccurrenceIndex: requestedRightOccurrenceIndex,
  } = route.useSearch();
  const showOccurrenceSelectors = occurrences.length > 2;

  const openQuickView = (documentId: string, pageNumber: number) => {
    navigate({
      to: '.',
      search: (prev) => ({
        ...prev,
        previewDocumentId: documentId,
        previewPageNumber: pageNumber,
      }),
      replace: true,
      resetScroll: false,
    });
  };

  const { left: leftOccurrenceIndex, right: rightOccurrenceIndex } =
    getSelectedOccurrenceIndices(
      requestedLeftOccurrenceIndex ?? 0,
      requestedRightOccurrenceIndex ?? 1,
      occurrences.length,
    );

  const setSelectedOccurrenceIndices = (
    nextLeft: number,
    nextRight: number,
  ) => {
    navigate({
      to: '.',
      search: (prev) => ({
        ...prev,
        leftOccurrenceIndex: nextLeft === 0 ? undefined : nextLeft,
        rightOccurrenceIndex: nextRight === 1 ? undefined : nextRight,
      }),
      replace: true,
      resetScroll: false,
    });
  };

  const leftOccurrence = occurrences[leftOccurrenceIndex] ?? occurrences.at(0);
  const rightOccurrence =
    occurrences[rightOccurrenceIndex] ?? occurrences.at(0);
  invariant(leftOccurrence !== undefined, 'Expected left occurrence');
  invariant(rightOccurrence !== undefined, 'Expected right occurrence');

  const leftColumn: OccurrenceColumn = {
    occurrence: leftOccurrence,
    occurrenceIndex: leftOccurrenceIndex,
  };
  const rightColumn: OccurrenceColumn = {
    occurrence: rightOccurrence,
    occurrenceIndex: rightOccurrenceIndex,
  };

  const handleLeftOccurrenceChange = (nextLeftOccurrenceIndex: number) => {
    const nextLeft = normalizeOccurrenceIndex(
      nextLeftOccurrenceIndex,
      occurrences.length,
    );

    setSelectedOccurrenceIndices(nextLeft, rightOccurrenceIndex);
  };

  const handleRightOccurrenceChange = (nextRightOccurrenceIndex: number) => {
    const nextRight = normalizeOccurrenceIndex(
      nextRightOccurrenceIndex,
      occurrences.length,
    );

    setSelectedOccurrenceIndices(leftOccurrenceIndex, nextRight);
  };

  return (
    <div className="flex min-w-0 gap-2">
      <OccurrenceComparisonColumn
        side="left"
        occurrenceColumn={leftColumn}
        disabledOccurrenceIndex={rightColumn.occurrenceIndex}
        occurrences={occurrences}
        showOccurrenceSelectors={showOccurrenceSelectors}
        showPdf={!previewDocumentId}
        onOccurrenceChange={handleLeftOccurrenceChange}
        onOpenQuickView={openQuickView}
      />
      <OccurrenceComparisonColumn
        side="right"
        occurrenceColumn={rightColumn}
        disabledOccurrenceIndex={leftColumn.occurrenceIndex}
        occurrences={occurrences}
        showOccurrenceSelectors={showOccurrenceSelectors}
        showPdf={!previewDocumentId}
        onOccurrenceChange={handleRightOccurrenceChange}
        onOpenQuickView={openQuickView}
      />
    </div>
  );
};
