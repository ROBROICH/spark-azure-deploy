import { Skeleton } from '@/features/ui/skeleton/Skeleton';
import { SafePdfIframe } from '@/features/shared/remote-files/SafePdfIframe';
import { toSafePdfIframeSrc } from '@/features/shared/remote-files/downloadUrlSafety';
import { cn } from '@/features/ui/style/cn';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

type PdfQuickViewProps = {
  title: string;
  pdfUrl: string | undefined;
  onClose: () => void;
  pageNumber?: number;
  isLoading?: boolean;
  variant?: 'framed' | 'embedded';
  showHeader?: boolean;
};

export const PdfQuickView = (props: PdfQuickViewProps) => {
  const {
    title,
    pdfUrl,
    onClose,
    pageNumber,
    isLoading,
    variant = 'framed',
    showHeader = true,
  } = props;
  const { t } = useTranslation('shared');
  const isEmbedded = variant === 'embedded';

  const pdfUrlWithPage = toSafePdfIframeSrc(pdfUrl, pageNumber);

  return (
    <div
      className={cn(
        'flex h-full w-full flex-col bg-neutral-white',
        !isEmbedded && 'rounded-lg border border-border-primary',
      )}
    >
      {showHeader ? (
        <div
          className={cn(
            'flex shrink-0 items-center justify-between px-4 py-3',
            !isEmbedded && 'border-b border-border-primary',
          )}
        >
          <h3
            className="text-label-m break-words text-text-primary lg:truncate"
            title={title}
          >
            {title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="focus-ring cursor-pointer rounded p-1 hover:bg-bg-tertiary"
            aria-label={t('PdfQuickView.closePreview')}
          >
            <X className="size-5 text-text-secondary" />
          </button>
        </div>
      ) : null}

      <div className={cn('min-h-0 flex-1', !isEmbedded && 'p-4')}>
        {isLoading ? (
          <Skeleton className="h-full w-full rounded-lg" />
        ) : pdfUrlWithPage ? (
          <SafePdfIframe
            src={pdfUrlWithPage}
            className="h-full w-full rounded-lg border border-border-primary"
            title={title}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-text-secondary">
            {t('PdfQuickView.documentNotFound')}
          </div>
        )}
      </div>
    </div>
  );
};
