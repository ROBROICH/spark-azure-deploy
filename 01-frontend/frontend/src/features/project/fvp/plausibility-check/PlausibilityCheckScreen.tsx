import { DEFAULT_RATING_THRESHOLD } from './data/filtering/contradictionFilters';
import { getRouteApi, Link } from '@tanstack/react-router';
import { ChevronLeft } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useFvpWorkflowContext } from '@/features/workflow-runtime/workflow-status/FvpWorkflowContext';
import { usePpData } from '@/features/project/fvp/data/useFvpCategoryData';
import { Button } from '@/features/ui/button/Button';
import { CompletionIndicator } from '@/features/ui/completion-indicator/CompletionIndicator';
import { cn } from '@/features/ui/style/cn';

import { ContradictionsList } from './contradictions-list/ContradictionsList';
import { ContradictionsToolbar } from './contradictions-list/ContradictionsToolbar';
import { useFilteredContradictions } from './data/read-model/useContradictions';
import { NoticeCards } from './notice-cards/NoticeCards';
import { PdfPreview } from './pdf-preview/PdfPreview';
import { PlausibilityWorkflowLoadingSkeleton } from './workflow-loading/PlausibilityWorkflowLoadingSkeleton';

const route = getRouteApi('/verfahren/$verfahrenId/fvp/pp/');

/**
 * Main page component for Plausibility Check (Plausibilitätsprüfung).
 *
 * Displays AI-detected contradictions in the project documents,
 * allowing users to review, dismiss as irrelevant, or add to the request list.
 *
 * Note: ProjectNavbar is provided by the shared layout route.
 */
export const PlausibilityCheckScreen = () => {
  const { t } = useTranslation('PlausibilityCheck');
  const { search, statusFilter, documentFilter, previewDocumentId } =
    route.useSearch();
  const { verfahrenId } = route.useParams();
  const { plausibilityWorkflow } = useFvpWorkflowContext();
  const isPlausibilityWorkflowLoading = plausibilityWorkflow.isLoading;
  const { isLoading: isPpLoading } = usePpData(verfahrenId, {
    fcsReady: true,
    tocReady: true,
  });
  /*
   * The sensitivity threshold is local-only by requirement: shared links must
   * always open at the default threshold instead of restoring a filter.
   */
  // eslint-disable-next-line no-restricted-syntax -- this filter must not be URL-backed; shared PP links must start from the default sensitivity threshold.
  const [ratingThreshold, setRatingThreshold] = useState<number | undefined>();
  const {
    contradictions,
    summary,
    filteredCount,
    totalCount,
    documentOptions,
    hasUsableRatings,
    minimumRating,
    isLoading,
  } = useFilteredContradictions({
    projectId: verfahrenId,
    search,
    statusFilter,
    documentFilter,
    ratingThreshold,
  });
  const processedCount = Math.max(summary.total - summary.open, 0);
  const defaultRatingThreshold = DEFAULT_RATING_THRESHOLD;
  const currentRatingThreshold = ratingThreshold ?? defaultRatingThreshold;
  const hasCustomRatingThreshold =
    ratingThreshold !== undefined &&
    currentRatingThreshold !== defaultRatingThreshold;
  const hasFilters = Boolean(
    search || statusFilter || documentFilter || hasCustomRatingThreshold,
  );
  const handleRatingThresholdChange = (value: number) => {
    const normalizedValue = Math.round(value * 100) / 100;

    setRatingThreshold(
      normalizedValue === defaultRatingThreshold ? undefined : normalizedValue,
    );
  };

  if (isPlausibilityWorkflowLoading && isPpLoading) {
    return <PlausibilityWorkflowLoadingSkeleton />;
  }

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col bg-white">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white p-2">
        <Button
          variant="secondary"
          size="sm"
          iconOnly
          aria-label={t('redesign.backToDocuments')}
          asChild
        >
          <Link
            to="/verfahren/$verfahrenId/fvp/documents"
            params={{ verfahrenId }}
            resetScroll={false}
          >
            <ChevronLeft />
          </Link>
        </Button>
        <h2 className="flex-1 text-[13px] leading-[18px] font-medium text-brand-950">
          {t('redesign.stepTitle')}
        </h2>
        <CompletionIndicator
          completed={processedCount}
          total={summary.total}
          className="shrink-0 px-3 py-2 whitespace-nowrap"
        >
          {t('redesign.progress', {
            processed: processedCount,
            total: summary.total,
          })}
        </CompletionIndicator>
      </div>

      <div className="flex min-h-0 flex-1 justify-center bg-white md:overflow-auto">
        <div className="flex w-full max-w-container items-start gap-4 px-8 py-16 md:px-32">
          <div
            className={cn(
              'flex min-w-0 flex-col gap-16',
              previewDocumentId ? 'w-1/2' : 'w-full',
            )}
          >
            {!previewDocumentId && (
              <NoticeCards summary={summary} isLoading={isLoading} />
            )}

            <section className="flex min-w-0 flex-col gap-4 pb-16">
              <ContradictionsToolbar
                filteredCount={filteredCount}
                totalCount={totalCount}
                documentOptions={documentOptions}
                hasUsableRatings={hasUsableRatings}
                minimumRating={minimumRating}
                ratingThreshold={currentRatingThreshold}
                onRatingThresholdChange={handleRatingThresholdChange}
              />
              <ContradictionsList
                contradictions={contradictions}
                hasFilters={hasFilters}
                isLoading={isPlausibilityWorkflowLoading && isLoading}
              />
            </section>
          </div>

          {previewDocumentId && (
            <div className="sticky top-8 h-[min(64rem,calc(100dvh-8rem))] w-1/2 shrink-0 self-start">
              <PdfPreview />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
