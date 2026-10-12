import { Skeleton } from '@/features/ui/skeleton/Skeleton';
import { Button } from '@/features/ui/button/Button';
import { cn } from '@/features/ui/style/cn';
import { Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';

type ArgumentsProgressBadgeProps = {
  totalCount: number;
  approvedCount: number;
  className?: string;
};

const ArgumentsProgressBadge = (props: ArgumentsProgressBadgeProps) => {
  const { totalCount, approvedCount, className } = props;
  const { t } = useTranslation('Ewms');

  if (totalCount === 0) {
    return null;
  }

  return (
    <div
      className={cn(
        'rounded bg-green-50 px-2 py-[5px] text-[11px] leading-[14px] font-medium tracking-[0.22px] text-green-900 shadow-[inset_0_0_0_0.5px_rgb(34_197_94)] md:shrink-0',
        className,
      )}
    >
      {t('arguments.progressBadge', {
        approvedCount,
        count: totalCount,
        totalCount,
      })}
    </div>
  );
};

type ArgumentsToolbarProps = {
  totalCount: number;
  approvedCount: number;
  isLoading?: boolean;
  onAddArgument?: () => void;
};

export const ArgumentsToolbar = (props: ArgumentsToolbarProps) => {
  const { totalCount, approvedCount, isLoading = false, onAddArgument } = props;
  const { t } = useTranslation('Ewms');

  return (
    <div className="mx-2 mt-2 flex h-8 items-center justify-between rounded-lg p-1">
      {onAddArgument && (
        <Button variant="ghost" size="sm" withIcon onClick={onAddArgument}>
          <Plus />
          {t('arguments.addArgument')}
        </Button>
      )}
      {isLoading ? (
        <Skeleton className="h-6 w-40 rounded" />
      ) : totalCount > 0 ? (
        <ArgumentsProgressBadge
          totalCount={totalCount}
          approvedCount={approvedCount}
        />
      ) : null}
    </div>
  );
};
