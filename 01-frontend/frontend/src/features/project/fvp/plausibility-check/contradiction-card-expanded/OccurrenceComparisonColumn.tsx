import type { ContradictionOccurrence } from '@/api-clients/pns-module';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { ComparisonTableDocumentButton } from './ComparisonTableDocumentButton';
import { InlinePdfViewer } from './InlinePdfViewer';
import { OccurrenceSelect } from './OccurrenceSelect';

type OccurrenceColumn = {
  occurrence: ContradictionOccurrence;
  occurrenceIndex: number;
};

type OccurrenceComparisonColumnProps = {
  side: 'left' | 'right';
  occurrenceColumn: OccurrenceColumn;
  disabledOccurrenceIndex: number;
  occurrences: ContradictionOccurrence[];
  showOccurrenceSelectors: boolean;
  showPdf: boolean;
  onOccurrenceChange: (occurrenceIndex: number) => void;
  onOpenQuickView: (documentId: string, pageNumber: number) => void;
};

const getDocumentName = (occurrence: ContradictionOccurrence) =>
  occurrence.documentName ?? occurrence.documentId;

const getPageNumber = (occurrence: ContradictionOccurrence) =>
  occurrence.pageNumber ?? 1;

const DetailItem = (props: { label: string; children: ReactNode }) => {
  const { label, children } = props;

  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] leading-[14px] font-medium tracking-[0.02em] text-slate-700">
        {label}
      </span>
      <div className="text-[13px] leading-[18px] font-medium tracking-[-0.01em] text-brand-950">
        {children}
      </div>
    </div>
  );
};

export const OccurrenceComparisonColumn = (
  props: OccurrenceComparisonColumnProps,
) => {
  const {
    side,
    occurrenceColumn,
    disabledOccurrenceIndex,
    occurrences,
    showOccurrenceSelectors,
    showPdf,
    onOccurrenceChange,
    onOpenQuickView,
  } = props;
  const { t } = useTranslation('PlausibilityCheck');
  const getOccurrenceLabel = (occurrenceIndex: number) =>
    t('ComparisonTable.textPassageIndexed', {
      index: occurrenceIndex + 1,
    });
  const { occurrence, occurrenceIndex } = occurrenceColumn;
  const occurrenceLabel = getOccurrenceLabel(occurrenceIndex);
  const pageNumber = getPageNumber(occurrence);
  const documentName = getDocumentName(occurrence);
  const selectorLabel = t(
    side === 'left'
      ? 'ComparisonTable.leftOccurrence'
      : 'ComparisonTable.rightOccurrence',
  );

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2">
      {showPdf ? (
        <div className="order-1">
          <InlinePdfViewer
            documentId={occurrence.documentId}
            pageNumber={pageNumber}
            label={occurrenceLabel}
            viewerKey={`${occurrence.documentId}-${pageNumber}-${occurrenceIndex}`}
            hideLabel
          />
        </div>
      ) : null}

      <div className="order-2 flex flex-1 flex-col gap-4 rounded-xl bg-slate-50 p-4">
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] leading-[14px] font-medium tracking-[0.02em] text-slate-700">
            {t('ContradictionCardExpanded.affectedTextPassages', {
              count: occurrences.length,
            })}
          </span>
          {showOccurrenceSelectors ? (
            <OccurrenceSelect
              occurrences={occurrences}
              selectedOccurrenceIndex={occurrenceIndex}
              disabledOccurrenceIndex={disabledOccurrenceIndex}
              label={selectorLabel}
              onChange={onOccurrenceChange}
              getOccurrenceLabel={getOccurrenceLabel}
              getDocumentName={getDocumentName}
            />
          ) : (
            <span className="rounded-lg border-[0.5px] border-slate-400 bg-white px-3 py-2 text-left text-[11px] leading-[14px] font-medium tracking-[0.02em] text-slate-600 shadow-[0px_4px_16px_0px_rgba(2,6,23,0.1),0px_2px_4px_0px_rgba(2,6,23,0.1)]">
              {occurrenceLabel}
            </span>
          )}
        </div>

        <DetailItem label={t('ComparisonTable.document')}>
          <ComparisonTableDocumentButton
            documentName={documentName}
            onOpen={() => onOpenQuickView(occurrence.documentId, pageNumber)}
          />
        </DetailItem>

        <DetailItem label={t('ComparisonTable.location')}>
          <span>
            {t('common.page')} {pageNumber}
          </span>
        </DetailItem>

        <DetailItem label={t('ComparisonTable.wording')}>
          <p>{occurrence.contentExcerpt}</p>
        </DetailItem>
      </div>
    </div>
  );
};
