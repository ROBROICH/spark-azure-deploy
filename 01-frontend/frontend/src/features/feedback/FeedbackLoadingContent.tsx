import { Skeleton } from '@/features/ui/skeleton/Skeleton';
import { DialogBody, DialogFooter } from '@/features/ui/dialog/Dialog';
import { useTranslation } from 'react-i18next';

export function FeedbackLoadingContent(props: { namespace: string }) {
  const { namespace } = props;
  const { t } = useTranslation(namespace);

  return (
    <>
      <span className="sr-only" role="status" aria-live="polite">
        {t('FeedbackDialog.loadingDescription')}
      </span>
      <DialogBody className="flex flex-col gap-4">
        <Skeleton className="h-5 w-2/3" aria-hidden />
        <div className="flex gap-2">
          <Skeleton className="h-8 w-28" aria-hidden />
          <Skeleton className="h-8 w-28" aria-hidden />
        </div>
        <hr className="border-border-primary" />
        <Skeleton className="h-5 w-1/2" aria-hidden />
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-8 w-36" aria-hidden />
          <Skeleton className="h-8 w-44" aria-hidden />
          <Skeleton className="h-8 w-32" aria-hidden />
        </div>
        <Skeleton className="h-[120px] w-full" aria-hidden />
      </DialogBody>
      <DialogFooter>
        <Skeleton className="h-8 w-24" aria-hidden />
        <Skeleton className="h-8 w-24" aria-hidden />
      </DialogFooter>
    </>
  );
}
