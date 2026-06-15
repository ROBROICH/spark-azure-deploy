import { AiNormCardShell } from '@/features/ui/cards/ai-norm-card/AiNormCardShell';
import { Skeleton } from '@/features/ui/skeleton/Skeleton';
import { useTranslation } from 'react-i18next';

type NormCardItemSkeletonProps = {
  withStatus?: boolean;
};

export const NormCardItemSkeleton = (props: NormCardItemSkeletonProps) => {
  const { withStatus = false } = props;
  const { t } = useTranslation('MvpRedesign');

  const skeleton = (
    <AiNormCardShell
      aiAction={<Skeleton className="h-6 w-20 rounded-md" aria-hidden />}
      menu={<Skeleton className="size-6 rounded-md" aria-hidden />}
      body={
        <div className="space-y-2">
          <Skeleton className="h-4 w-1/3" aria-hidden />
          <Skeleton className="h-4 w-full" aria-hidden />
        </div>
      }
      footer={<Skeleton className="h-6 w-24 rounded-[4px]" aria-hidden />}
    />
  );

  if (!withStatus) {
    return skeleton;
  }

  const label = t('NormCardItem.loadingTooltip');

  return (
    <div className="block" role="status" aria-live="polite" aria-label={label}>
      <span className="sr-only">{label}</span>
      {skeleton}
    </div>
  );
};
