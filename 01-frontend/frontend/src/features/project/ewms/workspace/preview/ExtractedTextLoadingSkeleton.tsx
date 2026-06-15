import { Skeleton, skeletonListProps } from '@/features/ui/skeleton/Skeleton';
import { useTranslation } from 'react-i18next';

export const ExtractedTextLoadingSkeleton = () => {
  const { t } = useTranslation('Ewms');

  return (
    <div
      role="status"
      aria-label={t('documentViewer.loadingExtractedText')}
      className="space-y-5"
      {...skeletonListProps}
    >
      <div className="space-y-3">
        <Skeleton className="h-6 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
      </div>

      <div className="space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-11/12" />
        <Skeleton className="h-4 w-4/5" />
      </div>

      <div className="space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-10/12" />
        <Skeleton className="h-4 w-3/4" />
      </div>

      <div className="space-y-3 pt-2">
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-5 w-1/2" />
      </div>

      <div className="space-y-2">
        <Skeleton className="h-4 w-11/12" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    </div>
  );
};
